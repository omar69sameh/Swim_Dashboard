import { generateHistoricalData, swimmers } from "@/lib/data";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { HistoricalDataPoint, StrokeType } from "@/types";
import { NextResponse } from "next/server";

function mapStroke(value: string): StrokeType {
  const v = value as StrokeType;
  if (
    v === "Freestyle" ||
    v === "Backstroke" ||
    v === "Breaststroke" ||
    v === "Butterfly" ||
    v === "IM"
  ) {
    return v;
  }
  return "Freestyle";
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
    if (!swimmer) {
      return NextResponse.json({ error: "Swimmer not found" }, { status: 404 });
    }
    return NextResponse.json(generateHistoricalData(swimmerId));
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role === "swimmer" && authUser.swimmerId !== swimmerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(swimmerId, authUser.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createSupabaseAdmin();
  const { data: sessionRows, error: sessErr } = await admin
    .from("swimming_sessions")
    .select("id, created_at, session_metadata")
    .eq("user_id", swimmerId)
    .eq("analysis_status", "completed");

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  const sessionIds = (sessionRows ?? []).map((r) => r.id as string);
  if (sessionIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: analyses, error: analErr } = await admin
    .from("session_analysis")
    .select("session_id, primary_stroke, quality_score, created_at")
    .in("session_id", sessionIds);

  if (analErr) {
    return NextResponse.json({ error: analErr.message }, { status: 500 });
  }

  const dateBySession = new Map<string, string>();
  for (const s of sessionRows ?? []) {
    const meta = s.session_metadata as { start_time?: string } | null;
    dateBySession.set(
      s.id as string,
      meta?.start_time ?? (s.created_at as string) ?? new Date().toISOString()
    );
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

  return NextResponse.json(points);
}
