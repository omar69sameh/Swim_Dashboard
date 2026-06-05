import { createSupabaseAdmin } from "./admin";
import type { AnalysisStatus, MLFeature, MLResults, StrokeSegment, StrokeType } from "@/types";

export interface SessionAnalysisRow {
  session_id: string;
  primary_stroke: string;
  stroke_confidence: number | null;
  quality_tier: string | null;
  quality_label: string | null;
  quality_score: number | null;
  num_strokes: number | null;
  strokes_json: unknown;
  pipeline_version: string;
  created_at: string | null;
}

export interface SessionStrokeRow {
  id: string;
  session_id: string;
  stroke_index: number;
  stroke_type: string;
  quality_tier: string | null;
  quality_label: string | null;
  confidence: number | null;
  start_time: number | null;
  peak_time: number | null;
  end_time: number | null;
  predicted_stroke_type: string | null;
  created_at: string | null;
}

const SESSION_STROKES_SELECT =
  "id,session_id,stroke_index,stroke_type,quality_tier,quality_label,confidence,start_time,peak_time,end_time,predicted_stroke_type";

export async function fetchSessionStrokes(sessionId: string): Promise<SessionStrokeRow[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("session_strokes")
    .select(SESSION_STROKES_SELECT)
    .eq("session_id", sessionId)
    .order("stroke_index", { ascending: true });

  if (error) {
    // Table might not exist yet — return empty so we fall back to strokes_json
    if (error.code === "42P01") return [];
    console.error("fetchSessionStrokes:", error.message);
    return [];
  }
  return (data ?? []) as SessionStrokeRow[];
}

export interface SwimmingSessionWithAnalysis {
  analysis_status?: string | null;
  analysis_error?: string | null;
  analyzed_at?: string | null;
}

export async function fetchAnalysisMap(
  sessionIds: string[]
): Promise<Map<string, SessionAnalysisRow>> {
  const map = new Map<string, SessionAnalysisRow>();
  if (sessionIds.length === 0) return map;

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("session_analysis")
    .select("*")
    .in("session_id", sessionIds);

  if (error) {
    console.error("fetchAnalysisMap:", error.message);
    return map;
  }

  for (const row of (data ?? []) as SessionAnalysisRow[]) {
    map.set(row.session_id, row);
  }
  return map;
}

export async function fetchAnalysis(sessionId: string): Promise<SessionAnalysisRow | null> {
  const map = await fetchAnalysisMap([sessionId]);
  return map.get(sessionId) ?? null;
}

function mapStrokeType(value: string): StrokeType {
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

export function analysisToSessionStatus(
  analysisStatus: string | null | undefined,
  hasAnalysis: boolean
): AnalysisStatus {
  if (analysisStatus === "processing") return "processing";
  if (analysisStatus === "failed") return "failed";
  if (analysisStatus === "completed" || hasAnalysis) return "completed";
  if (analysisStatus === "pending") return "pending";
  return hasAnalysis ? "completed" : "pending";
}

/**
 * Build MLResults from session_analysis row.
 * @param strokeRows  Rows from session_strokes (preferred). Falls back to
 *                    parsing strokes_json from the analysis row if empty.
 */
export function analysisRowToMLResults(
  sessionId: string,
  row: SessionAnalysisRow,
  strokeRows: SessionStrokeRow[] = []
): MLResults {
  const strokeType = mapStrokeType(row.primary_stroke);
  const score = row.quality_score ?? 0;
  const tier = row.quality_tier?.replace(/_/g, " ") ?? "—";
  const label = row.quality_label ?? "—";

  const category = (v: number): MLFeature["category"] => {
    if (v >= 75) return "good";
    if (v >= 50) return "average";
    return "needs_improvement";
  };

  // Map risk tier to a 0-100 score so the progress bar is meaningful
  const tierScoreMap: Record<string, number> = {
    low: 85, good: 85,
    moderate: 70,
    moderate_high: 50,
    high: 30, bad: 30, risk: 25,
  };
  const rawTier = (row.quality_tier ?? "").toLowerCase().replace(/-/g, "_");
  const tierScore = tierScoreMap[rawTier] ?? score;
  const tierCategory = (v: number): MLFeature["category"] =>
    v >= 75 ? "good" : v >= 50 ? "average" : "needs_improvement";

  const tierDisplayMap: Record<string, string> = {
    low: "Low Risk", good: "Low Risk",
    moderate: "Moderate Risk",
    moderate_high: "Moderate-High Risk",
    high: "High Risk", bad: "High Risk", risk: "High Risk",
  };
  const tierDisplay = tierDisplayMap[rawTier] ?? tier;

  const features: MLFeature[] = [
    {
      name: "Overall Quality",
      value: score,
      category: category(score),
      weight: 1,
      unit: label !== "—" ? label : undefined,
    },
    {
      name: "Risk Level",
      value: tierScore,
      category: tierCategory(tierScore),
      weight: 0.8,
      unit: tierDisplay,
    },
  ];

  let segments: StrokeSegment[] = [];

  if (strokeRows.length > 0) {
    // ── Preferred path: typed rows from session_strokes table ──────────────
    segments = strokeRows.map((s) => ({
      startIndex: s.stroke_index,
      endIndex: s.stroke_index + 1,
      strokeType: mapStrokeType(s.stroke_type),
      confidence: s.confidence != null ? (s.confidence <= 1 ? s.confidence * 100 : s.confidence) : 0,
      qualityTier: s.quality_tier ?? undefined,
      qualityLabel: s.quality_label ?? undefined,
      startTime: s.start_time ?? undefined,
      peakTime: s.peak_time ?? undefined,
      endTime: s.end_time ?? undefined,
    }));
  } else if (Array.isArray(row.strokes_json)) {
    // ── Fallback: parse strokes_json (older sessions before table existed) ──
    segments = (row.strokes_json as Record<string, unknown>[]).map((s, i) => {
      const rawConf = Number(s.confidence ?? 0);
      return {
        startIndex: typeof s.stroke_index === "number" ? s.stroke_index : i,
        endIndex: (typeof s.stroke_index === "number" ? s.stroke_index : i) + 1,
        strokeType: mapStrokeType(String(s.segmentation_style ?? s.predicted_stroke_type ?? row.primary_stroke)),
        confidence: rawConf <= 1 ? rawConf * 100 : rawConf,
        qualityTier: typeof s.quality_tier === "string" ? s.quality_tier : undefined,
        qualityLabel: typeof s.predicted_quality === "string" ? s.predicted_quality : undefined,
        startTime: typeof s.start_time === "number" ? s.start_time : undefined,
        peakTime: typeof s.peak_time === "number" ? s.peak_time : undefined,
        endTime: typeof s.end_time === "number" ? s.end_time : undefined,
      };
    });
  }

  return {
    sessionId,
    strokeType,
    strokeTypeConfidence: Math.min(100, (row.stroke_confidence ?? 0) * (row.stroke_confidence! <= 1 ? 100 : 1)),
    overallQualityScore: score,
    qualityTier: rawTier || undefined,
    qualityLabel: label !== "—" ? label : undefined,
    numStrokes: row.num_strokes ?? undefined,
    segments,
    features,
    sensorData: [],
    processingTime: 0,
    pipelineVersion: row.pipeline_version,
  };
}
