import { swimmers } from "@/lib/data";
import { getSwimmerIdsForCoach as getMockSwimmerIdsForCoach } from "@/lib/mock-auth";
import { mapProfileToSwimmer } from "@/lib/supabase/mappers";
import { computeSwimmerStats } from "@/lib/supabase/swimmer-stats";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, serverError, apiOk } from "@/lib/api-helpers";
import type { ProfileRow } from "@/lib/supabase/database.types";
import { NextRequest } from "next/server";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

/**
 * GET /api/swimmers
 * Returns swimmers visible to the current user (role-scoped).
 */
export async function GET(request: NextRequest) {
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");
  const coachId = request.nextUrl.searchParams.get("coachId");

  if (!isSupabaseConfigured()) {
    if (swimmerId) return apiOk(swimmers.filter((s) => s.id === swimmerId));
    if (coachId) {
      const ids = getMockSwimmerIdsForCoach(coachId);
      return apiOk(swimmers.filter((s) => ids.includes(s.id)));
    }
    return apiOk(swimmers);
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  const admin = createSupabaseAdmin();
  let profileQuery = admin.from("profiles").select(PROFILE_SELECT);

  if (authUser.role === "swimmer") {
    profileQuery = profileQuery.eq("id", authUser.swimmerId!);
  } else if (authUser.role === "coach") {
    profileQuery = profileQuery.eq("coach_id", authUser.id).eq("role", "swimmer");
  } else if (swimmerId) {
    profileQuery = profileQuery.eq("id", swimmerId);
  }

  const { data: profiles, error: profileError } = await profileQuery;
  if (profileError) return serverError(profileError.message);

  const profileIds = (profiles as ProfileRow[]).map((p) => p.id);
  if (profileIds.length === 0) return apiOk([]);

  const statsMap = await computeSwimmerStats(admin, profileIds);

  const list = (profiles as ProfileRow[]).map((p) => {
    const stats = statsMap.get(p.id);
    const swimmer = mapProfileToSwimmer(p, stats?.count ?? 0, stats?.lastDate ?? null);
    if (stats?.averageQualityScore != null) {
      swimmer.averageQualityScore = stats.averageQualityScore;
    }
    return swimmer;
  });

  return apiOk(list);
}
