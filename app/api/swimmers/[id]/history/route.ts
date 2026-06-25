import { generateHistoricalData, swimmers } from "@/lib/data";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, notFound, serverError, apiOk } from "@/lib/api-helpers";
import type { HistoricalDataPoint, StrokeType } from "@/types";

function mapStroke(value: string): StrokeType {
  const valid: StrokeType[] = ["Freestyle", "Backstroke", "Breaststroke", "Butterfly", "IM"];
  return valid.includes(value as StrokeType) ? (value as StrokeType) : "Freestyle";
}

/**
 * GET /api/swimmers/:id/history
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: swimmerId } = await params;

  if (!isSupabaseConfigured()) {
    const swimmer = swimmers.find((s) => s.id === swimmerId);
    return swimmer ? apiOk(generateHistoricalData(swimmerId)) : notFound("Swimmer");
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  if (authUser.role === "swimmer" && authUser.swimmerId !== swimmerId) return forbidden();

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(swimmerId, authUser.id);
    if (!allowed) return forbidden();
  }

  const admin = createSupabaseAdmin();
  const { data: sessionRows, error: sessErr } = await admin
    .from("swimming_sessions")
    .select("id, created_at, session_metadata")
    .eq("user_id", swimmerId)
    .eq("analysis_status", "completed");

  if (sessErr) return serverError(sessErr.message);

  const sessionIds = (sessionRows ?? []).map((r) => r.id as string);
  if (sessionIds.length === 0) return apiOk([]);

  const { data: analyses, error: analErr } = await admin
    .from("session_analysis")
    .select("session_id, primary_stroke, quality_score, created_at")
    .in("session_id", sessionIds);

  if (analErr) return serverError(analErr.message);

  const dateBySession = new Map<string, string>();
  for (const s of sessionRows ?? []) {
    const meta = s.session_metadata as { start_time?: string } | null;
    dateBySession.set(s.id as string, meta?.start_time ?? (s.created_at as string) ?? new Date().toISOString());
  }

  const points: HistoricalDataPoint[] = (analyses ?? [])
    .filter((a) => a.quality_score != null)
    .map((a) => ({
      date: dateBySession.get(a.session_id as string) ?? (a.created_at as string),
      qualityScore: a.quality_score as number,
      strokeType: mapStroke(a.primary_stroke as string),
      sessionId: a.session_id as string,
    }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return apiOk(points);
}
