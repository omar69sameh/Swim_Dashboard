import { generateMLResults, sessions } from "@/lib/data";
import {
  analysisRowToMLResults,
  fetchAnalysis,
  fetchSessionStrokes,
} from "@/lib/supabase/analysis";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

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
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    if (session.status === "pending" || session.status === "processing") {
      return NextResponse.json(
        { error: "Analysis not yet complete", status: session.status },
        { status: 202 }
      );
    }
    if (session.status === "failed") {
      return NextResponse.json(
        { error: "Analysis failed", status: session.status },
        { status: 422 }
      );
    }
    try {
      return NextResponse.json(generateMLResults(id, { lite: true }));
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to generate ML results";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data: sessionRow, error } = await admin
    .from("swimming_sessions")
    .select("id, user_id, analysis_status, analysis_error")
    .eq("id", id)
    .maybeSingle();

  if (error || !sessionRow) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  if (authUser.role === "swimmer" && sessionRow.user_id !== authUser.swimmerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(sessionRow.user_id, authUser.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const status = sessionRow.analysis_status ?? "pending";

  if (status === "pending" || status === "processing") {
    return NextResponse.json(
      { error: "Analysis not yet complete", status },
      { status: 202 }
    );
  }

  if (status === "failed") {
    return NextResponse.json(
      {
        error: sessionRow.analysis_error ?? "Analysis failed",
        status,
      },
      { status: 422 }
    );
  }

  // Fetch session_analysis and session_strokes in parallel
  const [analysis, strokeRows] = await Promise.all([
    fetchAnalysis(id),
    fetchSessionStrokes(id),
  ]);

  if (!analysis) {
    return NextResponse.json(
      { error: "Analysis not yet complete", status: "pending" },
      { status: 202 }
    );
  }

  return NextResponse.json(analysisRowToMLResults(id, analysis, strokeRows));
}
