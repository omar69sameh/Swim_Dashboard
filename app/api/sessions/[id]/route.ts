import { sessions } from "@/lib/data";
import { getSwimmerIdsForCoach as getMockSwimmerIdsForCoach } from "@/lib/mock-auth";
import { fetchAnalysis } from "@/lib/supabase/analysis";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapSwimmingSessionToSession } from "@/lib/supabase/mappers";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, notFound, apiOk } from "@/lib/api-helpers";
import type { SwimmingSessionRow } from "@/lib/supabase/database.types";

const SESSION_SELECT =
  "id, user_id, session_id, swimmer_info, device_info, session_metadata, created_at, analysis_status, analyzed_at";

/**
 * GET /api/sessions/:id
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  if (!isSupabaseConfigured()) {
    const session = sessions.find((s) => s.id === id);
    if (!session) return notFound("Session");
    if (authUser.role === "swimmer" && session.swimmerId !== authUser.swimmerId) return forbidden();
    if (authUser.role === "coach") {
      const assigned = getMockSwimmerIdsForCoach(authUser.coachId ?? "");
      if (!assigned.includes(session.swimmerId)) return forbidden();
    }
    return apiOk(session);
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("swimming_sessions")
    .select(SESSION_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return notFound("Session");

  const row = data as SwimmingSessionRow;

  if (authUser.role === "swimmer" && row.user_id !== authUser.swimmerId) return forbidden();

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(row.user_id, authUser.id);
    if (!allowed) return forbidden();
  }

  const analysis = await fetchAnalysis(id);
  return apiOk(mapSwimmingSessionToSession(row, analysis));
}
