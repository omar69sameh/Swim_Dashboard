import { swimmers } from "@/lib/data";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapProfileToSwimmer } from "@/lib/supabase/mappers";
import { computeSwimmerStats } from "@/lib/supabase/swimmer-stats";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, notFound, serverError, apiOk } from "@/lib/api-helpers";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { NextRequest } from "next/server";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

/**
 * GET /api/swimmers/:id
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    const swimmer = swimmers.find((s) => s.id === id);
    return swimmer ? apiOk(swimmer) : notFound("Swimmer");
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  if (authUser.role === "swimmer" && authUser.swimmerId !== id) return forbidden();

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(id, authUser.id);
    if (!allowed) return forbidden();
  }

  const admin = createSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !profile) return notFound("Swimmer");

  const statsMap = await computeSwimmerStats(admin, [id]);
  const stats = statsMap.get(id);

  const swimmer = mapProfileToSwimmer(profile as ProfileRow, stats?.count ?? 0, stats?.lastDate ?? null);
  if (stats?.averageQualityScore != null) {
    swimmer.averageQualityScore = stats.averageQualityScore;
  }

  return apiOk(swimmer);
}
