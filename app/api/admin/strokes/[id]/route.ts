import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

/**
 * Maps a quality_tier string to a numeric score (0–100).
 * Same scale used by the ML pipeline's tier display.
 */
function tierToScore(tier: string | null): number | null {
  const t = (tier ?? "").toLowerCase().replace(/-/g, "_");
  if (t === "low")           return 85;
  if (t === "moderate")      return 70;
  if (t === "moderate_high") return 50;
  if (t === "high")          return 30;
  return null; // unknown tier — exclude from average
}

/**
 * Derives overall tier + label from the new average score.
 * Mirrors the thresholds used in the rest of the app.
 */
function scoreToTierAndLabel(avg: number): { tier: string; label: string } {
  if (avg >= 78) return { tier: "low",           label: "Good" };
  if (avg >= 62) return { tier: "moderate",      label: "Good" };
  if (avg >= 45) return { tier: "moderate_high", label: "Bad"  };
  return           { tier: "high",               label: "Bad"  };
}

/** Shared helper: recalculate session_analysis after any stroke change */
async function recalculateSessionQuality(sessionId: string) {
  const admin = createSupabaseAdmin();

  const { data: remaining } = await admin
    .from("session_strokes")
    .select("quality_tier")
    .eq("session_id", sessionId);

  const rows = (remaining ?? []) as Array<{ quality_tier: string | null }>;
  const scores = rows
    .map((r) => tierToScore(r.quality_tier))
    .filter((s): s is number => s !== null);

  const analysisUpdate: Record<string, unknown> = { num_strokes: rows.length };

  if (scores.length > 0) {
    const newScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const { tier, label } = scoreToTierAndLabel(newScore);
    analysisUpdate.quality_score = newScore;
    analysisUpdate.quality_tier  = tier;
    analysisUpdate.quality_label = label;
  }

  await admin
    .from("session_analysis")
    .update(analysisUpdate)
    .eq("session_id", sessionId);
}

const VALID_TIERS = ["low", "moderate", "moderate_high", "high"] as const;
type QualityTier = typeof VALID_TIERS[number];

/**
 * PATCH /api/admin/strokes/[id]
 * Update a stroke's quality_tier (and derived quality_label).
 * Automatically recalculates the session's overall quality_score.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { quality_tier } = body as { quality_tier?: string };

  if (!quality_tier || !VALID_TIERS.includes(quality_tier as QualityTier)) {
    return NextResponse.json(
      { error: `quality_tier must be one of: ${VALID_TIERS.join(", ")}` },
      { status: 400 }
    );
  }

  // Derive label from tier
  const quality_label = (quality_tier === "low" || quality_tier === "moderate") ? "Good" : "Bad";

  const admin = createSupabaseAdmin();

  // Get session_id before updating
  const { data: strokeRow } = await admin
    .from("session_strokes")
    .select("session_id")
    .eq("id", id)
    .maybeSingle();

  const sessionId = (strokeRow as Record<string, unknown> | null)?.session_id as string | undefined;

  // Update the stroke
  const { error } = await admin
    .from("session_strokes")
    .update({ quality_tier, quality_label })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Recalculate session quality from all strokes
  if (sessionId) {
    await recalculateSessionQuality(sessionId);
  }

  return NextResponse.json({ ok: true, quality_tier, quality_label });
}

/**
 * DELETE /api/admin/strokes/[id]
 *
 * 1. Reads the stroke's session_id before deleting.
 * 2. Deletes the stroke from session_strokes.
 * 3. Recalculates quality_score as the average of remaining strokes' tier scores.
 * 4. Updates session_analysis with the new score, tier, label, and num_strokes.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const admin = createSupabaseAdmin();

  // ── 1. Get session_id before we delete ───────────────────────────────────
  const { data: strokeRow } = await admin
    .from("session_strokes")
    .select("session_id")
    .eq("id", id)
    .maybeSingle();

  const sessionId = (strokeRow as Record<string, unknown> | null)?.session_id as string | undefined;

  // ── 2. Delete the stroke ──────────────────────────────────────────────────
  const { error: deleteError } = await admin
    .from("session_strokes")
    .delete()
    .eq("id", id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // ── 3. Recalculate quality from remaining strokes ────────────────────────
  if (sessionId) {
    await recalculateSessionQuality(sessionId);
  }

  return NextResponse.json({ ok: true });
}
