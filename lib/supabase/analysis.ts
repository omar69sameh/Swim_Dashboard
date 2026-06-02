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

export function analysisRowToMLResults(
  sessionId: string,
  row: SessionAnalysisRow
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

  const features: MLFeature[] = [
    {
      name: "Overall quality",
      value: score,
      category: category(score),
      weight: 1,
    },
    {
      name: `${strokeType} — stroke type`,
      value: score,
      category: category(score),
      weight: 0.9,
    },
    {
      name: "Quality tier",
      value: score,
      category: category(score),
      weight: 0.7,
      unit: tier,
    },
    {
      name: "Quality rating",
      value: score,
      category: category(score),
      weight: 0.6,
      unit: label,
    },
  ];

  let segments: StrokeSegment[] = [];
  if (Array.isArray(row.strokes_json)) {
    segments = (row.strokes_json as Record<string, unknown>[]).map((s, i) => ({
      startIndex: i,
      endIndex: i + 1,
      strokeType: mapStrokeType(String(s.segmentation_style ?? s.predicted_stroke_type ?? row.primary_stroke)),
      confidence: Number(s.confidence ?? row.stroke_confidence ?? 0) * (Number(s.confidence) <= 1 ? 100 : 1),
    }));
  }

  return {
    sessionId,
    strokeType,
    strokeTypeConfidence: Math.min(100, (row.stroke_confidence ?? 0) * (row.stroke_confidence! <= 1 ? 100 : 1)),
    overallQualityScore: score,
    numStrokes: row.num_strokes ?? undefined,
    segments,
    features,
    sensorData: [],
    processingTime: 0,
    pipelineVersion: row.pipeline_version,
  };
}
