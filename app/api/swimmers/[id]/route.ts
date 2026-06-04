import { swimmers } from "@/lib/data";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapProfileToSwimmer } from "@/lib/supabase/mappers";
import { fetchAnalysisMap } from "@/lib/supabase/analysis";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProfileRow, SwimmingSessionRow } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";

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
    if (!swimmer) {
      return NextResponse.json({ error: "Swimmer not found" }, { status: 404 });
    }
    return NextResponse.json(swimmer);
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  if (authUser.role === "swimmer" && authUser.swimmerId !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(id, authUser.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const admin = createSupabaseAdmin();
  const { data: profile, error } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !profile) {
    return NextResponse.json({ error: "Swimmer not found" }, { status: 404 });
  }

  const { data: sessions } = await admin
    .from("swimming_sessions")
    .select("id, user_id, created_at, session_metadata, analysis_status")
    .eq("user_id", id);

  const rows = (sessions ?? []) as Pick<
    SwimmingSessionRow,
    "id" | "user_id" | "created_at" | "session_metadata" | "analysis_status"
  >[];

  let lastDate: string | null = null;
  for (const row of rows) {
    const d = row.session_metadata?.start_time ?? row.created_at ?? null;
    if (d && (!lastDate || new Date(d) > new Date(lastDate))) lastDate = d;
  }

  const analysisMap = await fetchAnalysisMap(rows.map((r) => r.id));

  let qualitySum = 0;
  let qualityCount = 0;
  for (const row of rows) {
    const analysis = analysisMap.get(row.id);
    const completed = row.analysis_status === "completed" || analysis != null;
    const score = analysis?.quality_score;
    if (completed && score != null) {
      qualitySum += score;
      qualityCount += 1;
    }
  }

  const swimmer = mapProfileToSwimmer(profile as ProfileRow, rows.length, lastDate);
  if (qualityCount > 0) {
    swimmer.averageQualityScore = Math.round((qualitySum / qualityCount) * 10) / 10;
  }

  return NextResponse.json(swimmer);
}
