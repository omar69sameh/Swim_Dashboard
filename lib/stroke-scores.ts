import type { Session } from "@/types";
import type { StrokeQualityScore, TrackedStroke } from "@/types";

export const TRACKED_STROKES: TrackedStroke[] = [
  "Freestyle",
  "Breaststroke",
  "Butterfly",
];

/** Pure helper — pass sessions from hooks/services, never import mock data here */
export function getStrokeScoresForSwimmer(
  swimmerId: string,
  sessionList: Session[]
): StrokeQualityScore[] {
  return TRACKED_STROKES.map((strokeType) => {
    const strokeSessions = sessionList
      .filter(
        (s) =>
          s.swimmerId === swimmerId &&
          s.strokeType === strokeType &&
          s.status === "completed" &&
          s.qualityScore != null
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const latest = strokeSessions[0];

    return {
      strokeType,
      qualityScore: latest?.qualityScore ?? 0,
      numStrokes: latest?.numStrokes,
      lastSessionId: latest?.id,
      lastSessionDate: latest?.date,
    };
  });
}

export function getLastSessionForSwimmer(swimmerId: string, sessionList: Session[]) {
  return sessionList
    .filter((s) => s.swimmerId === swimmerId && s.status === "completed")
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
}

export interface PersonalBest {
  strokeType: TrackedStroke;
  qualityScore: number;
  qualityTier?: string;
  qualityLabel?: string;
  sessionId: string;
  date: string;
  numStrokes?: number;
}

/** Returns the single best-quality completed session per tracked stroke for a swimmer. */
export function getPersonalBestPerStroke(
  swimmerId: string,
  sessionList: Session[]
): PersonalBest[] {
  return TRACKED_STROKES.map((strokeType) => {
    const best = sessionList
      .filter(
        (s) =>
          s.swimmerId === swimmerId &&
          s.strokeType === strokeType &&
          s.status === "completed" &&
          s.qualityScore != null
      )
      .sort((a, b) => (b.qualityScore ?? 0) - (a.qualityScore ?? 0))[0];

    if (!best) return null;
    return {
      strokeType,
      qualityScore: best.qualityScore!,
      qualityTier: best.qualityTier,
      qualityLabel: best.qualityLabel,
      sessionId: best.id,
      date: best.date,
      numStrokes: best.numStrokes,
    };
  }).filter(Boolean) as PersonalBest[];
}

export interface MonthlyStrokeStat {
  strokeType: TrackedStroke;
  count: number;
  avgScore: number;
}

/** Returns per-stroke avg quality and session count for the current calendar month. */
export function getMonthlyStrokeStats(
  swimmerId: string,
  sessionList: Session[]
): MonthlyStrokeStat[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  const monthSessions = sessionList.filter((s) => {
    if (s.swimmerId !== swimmerId || s.status !== "completed" || s.qualityScore == null) return false;
    const d = new Date(s.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  return TRACKED_STROKES.map((strokeType) => {
    const matching = monthSessions.filter((s) => s.strokeType === strokeType);
    if (matching.length === 0) return null;
    const total = matching.reduce((sum, s) => sum + (s.qualityScore ?? 0), 0);
    return {
      strokeType,
      count: matching.length,
      avgScore: Math.round(total / matching.length),
    };
  }).filter(Boolean) as MonthlyStrokeStat[];
}
