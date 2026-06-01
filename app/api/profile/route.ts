import { listCoaches, validateCoachId } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { buildUserProfile } from "@/lib/supabase/profile-response";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

async function getCoachName(admin: ReturnType<typeof createSupabaseAdmin>, coachId: string | null) {
  if (!coachId) return null;
  const { data: coach } = await admin
    .from("profiles")
    .select("first_name, last_name")
    .eq("id", coachId)
    .maybeSingle();

  if (!coach) return null;
  return [coach.first_name, coach.last_name].filter(Boolean).join(" ").trim() || null;
}

/**
 * GET /api/profile — name, email, age, coach
 * PATCH /api/profile — body: { coachId?, age? }
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not available in mock mode" }, { status: 501 });
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const row = profile as ProfileRow;
  const coachName = await getCoachName(admin, row.coach_id);

  return NextResponse.json(buildUserProfile(row, authUser.email, coachName));
}

export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not available in mock mode" }, { status: 501 });
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role !== "swimmer") {
    return NextResponse.json({ error: "Only swimmers can update this profile" }, { status: 403 });
  }

  const body = await request.json();
  const updates: { coach_id?: string | null; age?: number } = {};

  if ("coachId" in body) {
    const coachId = body.coachId as string | null | undefined;
    if (coachId) {
      const valid = await validateCoachId(coachId);
      if (!valid) {
        return NextResponse.json({ error: "Invalid coach" }, { status: 400 });
      }
      updates.coach_id = coachId;
    } else {
      updates.coach_id = null;
    }
  }

  if ("age" in body && body.age != null) {
    const parsed = typeof body.age === "number" ? body.age : parseInt(String(body.age), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
      return NextResponse.json({ error: "Age must be between 1 and 120" }, { status: 400 });
    }
    updates.age = parsed;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No updates provided" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", authUser.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const row = updated as ProfileRow;
  const coachName = await getCoachName(admin, row.coach_id);

  return NextResponse.json(buildUserProfile(row, authUser.email, coachName));
}
