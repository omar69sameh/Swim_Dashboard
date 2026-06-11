import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

/**
 * GET /api/admin/sessions
 * Returns all swimming sessions with user name + analysis summary
 */
export async function GET() {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const admin = createSupabaseAdmin();

  // All sessions
  const { data: sessions, error: sessErr } = await admin
    .from("swimming_sessions")
    .select("id, user_id, analysis_status, session_metadata, created_at")
    .order("created_at", { ascending: false });

  if (sessErr) {
    return NextResponse.json({ error: sessErr.message }, { status: 500 });
  }

  const sessionList = (sessions ?? []) as Array<{
    id: string;
    user_id: string;
    analysis_status: string | null;
    session_metadata: { start_time?: string; duration_seconds?: number } | null;
    created_at: string | null;
  }>;

  if (sessionList.length === 0) {
    return NextResponse.json({ sessions: [] });
  }

  const sessionIds = sessionList.map((s) => s.id);
  const userIds = [...new Set(sessionList.map((s) => s.user_id))];

  // Fetch profiles for user names
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .in("id", userIds);

  // Fetch analysis summary (stroke type + quality + num_strokes)
  const { data: analyses } = await admin
    .from("session_analysis")
    .select("session_id, primary_stroke, quality_score, quality_tier, num_strokes")
    .in("session_id", sessionIds);

  // Fetch stroke counts from session_strokes
  const { data: strokeRows } = await admin
    .from("session_strokes")
    .select("session_id, id")
    .in("session_id", sessionIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: Record<string, unknown>) => [
      p.id as string,
      [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown",
    ])
  );

  const analysisMap = new Map(
    (analyses ?? []).map((a: Record<string, unknown>) => [a.session_id as string, a])
  );

  const strokeCountMap = new Map<string, number>();
  for (const row of strokeRows ?? []) {
    const sid = (row as Record<string, unknown>).session_id as string;
    strokeCountMap.set(sid, (strokeCountMap.get(sid) ?? 0) + 1);
  }

  const result = sessionList.map((s) => {
    const analysis = analysisMap.get(s.id) as Record<string, unknown> | undefined;
    return {
      id: s.id,
      userId: s.user_id,
      userName: profileMap.get(s.user_id) ?? "Unknown",
      analysisStatus: s.analysis_status ?? "pending",
      strokeType: (analysis?.primary_stroke as string) ?? "—",
      qualityScore: (analysis?.quality_score as number | null) ?? null,
      qualityTier: (analysis?.quality_tier as string | null) ?? null,
      numStrokes: strokeCountMap.get(s.id) ?? (analysis?.num_strokes as number | null) ?? 0,
      date: s.session_metadata?.start_time ?? s.created_at ?? "",
      createdAt: s.created_at ?? "",
    };
  });

  return NextResponse.json({ sessions: result });
}

const VALID_STROKES = ["Freestyle", "Butterfly", "Breaststroke", "Backstroke", "IM"] as const;

/**
 * POST /api/admin/sessions
 * Create a debug session for a swimmer (no raw sensor data — analysis only).
 */
export async function POST(request: NextRequest) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  const { userId, strokeType, date } = body as {
    userId?: string;
    strokeType?: string;
    date?: string;
  };

  if (!userId || !strokeType) {
    return NextResponse.json({ error: "userId and strokeType are required" }, { status: 400 });
  }
  if (!VALID_STROKES.includes(strokeType as (typeof VALID_STROKES)[number])) {
    return NextResponse.json({ error: `strokeType must be one of: ${VALID_STROKES.join(", ")}` }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const now = date ? new Date(date).toISOString() : new Date().toISOString();

  // Fetch swimmer profile for swimmer_info
  const { data: profile } = await admin
    .from("profiles")
    .select("first_name, last_name, age")
    .eq("id", userId)
    .maybeSingle();

  const p = profile as Record<string, unknown> | null;
  const swimmerName = p
    ? [p.first_name, p.last_name].filter(Boolean).join(" ")
    : "Unknown";

  // Generate a unique session_id (the mobile app normally provides this)
  const mobileSessionId = crypto.randomUUID();

  // Insert swimming_sessions row
  const { data: sessionRow, error: sessErr } = await admin
    .from("swimming_sessions")
    .insert({
      user_id: userId,
      session_id: mobileSessionId,
      analysis_status: "completed",
      analyzed_at: now,
      swimmer_info: { name: swimmerName, age: p?.age ?? null },
      session_metadata: { start_time: now, duration_seconds: 0 },
      device_info: { source: "admin_debug" },
    })
    .select("id")
    .single();

  if (sessErr || !sessionRow) {
    return NextResponse.json({ error: sessErr?.message ?? "Failed to create session" }, { status: 500 });
  }

  const sessionId = (sessionRow as Record<string, unknown>).id as string;

  // Insert session_analysis row (empty — strokes will be added separately)
  await admin.from("session_analysis").insert({
    session_id: sessionId,
    primary_stroke: strokeType,
    stroke_confidence: 1.0,
    quality_tier: null,
    quality_label: null,
    quality_score: null,
    num_strokes: 0,
    strokes_json: [],
    pipeline_version: "admin_debug",
  });

  return NextResponse.json({ ok: true, sessionId });
}
