import { listCoaches, validateCoachId } from "@/lib/supabase/coach-assignments";
import { invalidateProfileCache } from "@/lib/supabase/ensure-profile";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { buildUserProfile } from "@/lib/supabase/profile-response";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, notFound, badRequest, serverError, apiOk, apiError } from "@/lib/api-helpers";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { NextRequest } from "next/server";

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
 * GET /api/profile
 */
export async function GET() {
  if (!isSupabaseConfigured()) return apiError("Not available in mock mode", 501);

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  const admin = createSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", authUser.id)
    .maybeSingle();

  if (error || !profile) return notFound("Profile");

  const row = profile as ProfileRow;
  const coachName = await getCoachName(admin, row.coach_id);
  return apiOk(buildUserProfile(row, authUser.email, coachName));
}

/**
 * PATCH /api/profile
 */
export async function PATCH(request: NextRequest) {
  if (!isSupabaseConfigured()) return apiError("Not available in mock mode", 501);

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  if (authUser.role !== "swimmer") return forbidden();

  const body = await request.json();
  const updates: { coach_id?: string | null; age?: number } = {};

  if ("coachId" in body) {
    const coachId = body.coachId as string | null | undefined;
    if (coachId) {
      const valid = await validateCoachId(coachId);
      if (!valid) return badRequest("Invalid coach");
      updates.coach_id = coachId;
    } else {
      updates.coach_id = null;
    }
  }

  if ("age" in body && body.age != null) {
    const parsed = typeof body.age === "number" ? body.age : parseInt(String(body.age), 10);
    if (!Number.isFinite(parsed) || parsed < 1 || parsed > 120) {
      return badRequest("Age must be between 1 and 120");
    }
    updates.age = parsed;
  }

  if (Object.keys(updates).length === 0) return badRequest("No updates provided");

  const admin = createSupabaseAdmin();
  const { data: updated, error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", authUser.id)
    .select(PROFILE_SELECT)
    .single();

  if (error) return serverError(error.message);

  invalidateProfileCache(authUser.id);

  const row = updated as ProfileRow;
  const coachName = await getCoachName(admin, row.coach_id);
  return apiOk(buildUserProfile(row, authUser.email, coachName));
}
