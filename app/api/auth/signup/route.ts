import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { validateCoachId } from "@/lib/supabase/coach-assignments";
import { toAuthUser } from "@/lib/supabase/auth-user";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mockSignUp } from "@/lib/mock-auth";
import { badRequest, serverError, apiOk } from "@/lib/api-helpers";
import type { ProfileRow } from "@/lib/supabase/database.types";
import type { UserRole } from "@/types/auth";
import { NextRequest } from "next/server";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

/**
 * POST /api/auth/signup
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const email = body.email as string;
    const password = body.password as string;
    const name = (body.name as string)?.trim() ?? "";
    const role = (body.role as UserRole) ?? "swimmer";
    const coachId = body.coachId as string | undefined;
    const ageRaw = body.age;

    if (!email || !password || !name) return badRequest("Email, password and name are required");

    let age: number | null = null;
    if (role === "swimmer") {
      const parsed = typeof ageRaw === "number" ? ageRaw : parseInt(String(ageRaw), 10);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
        return badRequest("Valid age (1–120) is required for swimmers");
      }
      age = parsed;
    }

    if (!isSupabaseConfigured()) {
      const user = mockSignUp({ email, password, name, role, coachId, age: age ?? undefined });
      return apiOk(user);
    }

    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { role, name } },
    });

    if (error) return badRequest(error.message);

    if (!data.user) {
      return badRequest("Check your email to confirm your account, then sign in.");
    }

    const parts = name.split(/\s+/);
    const first_name = parts[0] ?? name;
    const last_name = parts.slice(1).join(" ");

    let assignedCoachId: string | null = null;
    if (role === "swimmer" && coachId) {
      const valid = await validateCoachId(coachId);
      if (valid) assignedCoachId = coachId;
    }

    const admin = createSupabaseAdmin();
    await admin.from("profiles").upsert({
      id: data.user.id,
      first_name,
      last_name: last_name || null,
      age,
      role,
      coach_id: assignedCoachId,
    });

    const { data: profile } = await admin
      .from("profiles")
      .select(PROFILE_SELECT)
      .eq("id", data.user.id)
      .maybeSingle();

    return apiOk(toAuthUser(data.user, profile as ProfileRow | null));
  } catch (err) {
    return serverError(err instanceof Error ? err.message : "Sign up failed");
  }
}
