import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

/**
 * GET /api/admin/sessions/[id]/strokes
 * Returns all strokes for a session (session_strokes table first,
 * falls back to strokes_json in session_analysis).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const admin = createSupabaseAdmin();

  // Try session_strokes table first.
  // Key rule: if the query SUCCEEDS (no error), the session is table-backed regardless
  // of whether rows exist yet. Only fall back to strokes_json on a real table error
  // (e.g. table doesn't exist — code 42P01).
  const { data: strokeRows, error: strokeErr } = await admin
    .from("session_strokes")
    .select(
      "id, stroke_index, stroke_type, quality_tier, quality_label, confidence, start_time, peak_time, end_time, predicted_stroke_type, created_at"
    )
    .eq("session_id", id)
    .order("stroke_index", { ascending: true });

  if (!strokeErr) {
    // Table query worked — this is a proper table-backed session (may have 0 rows for new sessions)
    return NextResponse.json({ strokes: strokeRows ?? [], source: "table" });
  }

  // Only reach here if the table itself errored (e.g. doesn't exist yet)
  // Fallback: parse strokes_json from session_analysis
  const { data: analysis } = await admin
    .from("session_analysis")
    .select("strokes_json, primary_stroke, quality_tier, quality_label")
    .eq("session_id", id)
    .maybeSingle();

  if (!analysis || !Array.isArray(analysis.strokes_json) || analysis.strokes_json.length === 0) {
    return NextResponse.json({ strokes: [], source: "none" });
  }

  const strokes = (analysis.strokes_json as Record<string, unknown>[]).map((s, i) => ({
    id: null, // no DB id for json strokes
    stroke_index: typeof s.stroke_index === "number" ? s.stroke_index : i,
    stroke_type: String(s.predicted_stroke_type ?? s.segmentation_style ?? analysis.primary_stroke ?? "—"),
    quality_tier: typeof s.quality_tier === "string" ? s.quality_tier : (analysis.quality_tier ?? null),
    quality_label: typeof s.predicted_quality === "string" ? s.predicted_quality : (analysis.quality_label ?? null),
    confidence: typeof s.confidence === "number" ? s.confidence : null,
    start_time: typeof s.start_time === "number" ? s.start_time : null,
    peak_time: typeof s.peak_time === "number" ? s.peak_time : null,
    end_time: typeof s.end_time === "number" ? s.end_time : null,
    predicted_stroke_type: null,
    created_at: null,
  }));

  return NextResponse.json({ strokes, source: "json" });
}

const VALID_TIERS = ["low", "moderate", "moderate_high", "high"] as const;
const VALID_STROKES = ["Freestyle", "Butterfly", "Breaststroke", "Backstroke", "IM"] as const;

function tierToScore(tier: string): number {
  if (tier === "low")           return 85;
  if (tier === "moderate")      return 70;
  if (tier === "moderate_high") return 50;
  return 30; // high
}

function scoreToTierAndLabel(avg: number): { tier: string; label: string } {
  if (avg >= 78) return { tier: "low",           label: "Good" };
  if (avg >= 62) return { tier: "moderate",      label: "Good" };
  if (avg >= 45) return { tier: "moderate_high", label: "Bad"  };
  return           { tier: "high",               label: "Bad"  };
}

/**
 * POST /api/admin/sessions/[id]/strokes
 * Add a new stroke to a session and recalculate overall quality.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id: sessionId } = await params;
  const body = await req.json().catch(() => ({}));
  const { quality_tier, stroke_type, confidence } = body as {
    quality_tier?: string;
    stroke_type?: string;
    confidence?: number;
  };

  if (!quality_tier || !VALID_TIERS.includes(quality_tier as (typeof VALID_TIERS)[number])) {
    return NextResponse.json({ error: `quality_tier must be one of: ${VALID_TIERS.join(", ")}` }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Determine stroke_type: use provided or fall back to session's primary_stroke
  let resolvedStrokeType = stroke_type ?? "";
  if (!resolvedStrokeType || !VALID_STROKES.includes(resolvedStrokeType as (typeof VALID_STROKES)[number])) {
    const { data: analysis } = await admin
      .from("session_analysis")
      .select("primary_stroke")
      .eq("session_id", sessionId)
      .maybeSingle();
    resolvedStrokeType = (analysis as Record<string, unknown> | null)?.primary_stroke as string ?? "Freestyle";
  }

  // Get next stroke_index
  const { data: existing } = await admin
    .from("session_strokes")
    .select("stroke_index")
    .eq("session_id", sessionId)
    .order("stroke_index", { ascending: false })
    .limit(1);

  const lastIndex = (existing as Array<{ stroke_index: number }> | null)?.[0]?.stroke_index ?? -1;
  const nextIndex = lastIndex + 1;

  const quality_label = (quality_tier === "low" || quality_tier === "moderate") ? "Good" : "Bad";

  // Insert the new stroke
  const { data: newStroke, error: insertErr } = await admin
    .from("session_strokes")
    .insert({
      session_id: sessionId,
      stroke_index: nextIndex,
      stroke_type: resolvedStrokeType,
      quality_tier,
      quality_label,
      confidence: confidence ?? 0.95,
      start_time: null,
      peak_time: null,
      end_time: null,
      predicted_stroke_type: resolvedStrokeType,
    })
    .select("id, stroke_index, stroke_type, quality_tier, quality_label, confidence, start_time, peak_time, end_time")
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  // Recalculate session quality from all strokes
  const { data: allStrokes } = await admin
    .from("session_strokes")
    .select("quality_tier")
    .eq("session_id", sessionId);

  const rows = (allStrokes ?? []) as Array<{ quality_tier: string | null }>;
  const scores = rows
    .map((r) => r.quality_tier ? tierToScore(r.quality_tier) : null)
    .filter((s): s is number => s !== null);

  if (scores.length > 0) {
    const newScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const { tier, label } = scoreToTierAndLabel(newScore);
    await admin
      .from("session_analysis")
      .update({
        quality_score: newScore,
        quality_tier: tier,
        quality_label: label,
        num_strokes: rows.length,
      })
      .eq("session_id", sessionId);
  }

  return NextResponse.json({ ok: true, stroke: newStroke });
}
