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
