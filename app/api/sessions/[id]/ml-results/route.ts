import { generateMLResults, sessions } from "@/lib/data";
import { analysisRowToMLResults, fetchAnalysis, fetchSessionStrokes } from "@/lib/supabase/analysis";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, notFound, serverError, apiOk, apiError } from "@/lib/api-helpers";

/**
 * GET /api/sessions/:id/ml-results
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    const session = sessions.find((s) => s.id === id);
    if (!session) return notFound("Session");

    if (session.status === "pending" || session.status === "processing") {
      return apiError("Analysis not yet complete", 202);
    }
    if (session.status === "failed") {
      return apiError("Analysis failed", 422);
    }
    try {
      return apiOk(generateMLResults(id, { lite: true }));
    } catch (err) {
      return serverError(err instanceof Error ? err.message : "Failed to generate ML results");
    }
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  const admin = createSupabaseAdmin();
  const { data: sessionRow, error } = await admin
    .from("swimming_sessions")
    .select("id, user_id, analysis_status, analysis_error")
    .eq("id", id)
    .maybeSingle();

  if (error || !sessionRow) return notFound("Session");

  if (authUser.role === "swimmer" && sessionRow.user_id !== authUser.swimmerId) return forbidden();

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(sessionRow.user_id, authUser.id);
    if (!allowed) return forbidden();
  }

  const status = sessionRow.analysis_status ?? "pending";

  if (status === "pending" || status === "processing") {
    return apiError("Analysis not yet complete", 202);
  }

  if (status === "failed") {
    return apiError(sessionRow.analysis_error ?? "Analysis failed", 422);
  }

  const [analysis, strokeRows] = await Promise.all([fetchAnalysis(id), fetchSessionStrokes(id)]);
  if (!analysis) return apiError("Analysis not yet complete", 202);

  return apiOk(analysisRowToMLResults(id, analysis, strokeRows));
}
