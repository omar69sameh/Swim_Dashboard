import type { Session, StrokeType, Swimmer } from "@/types";
import type { SessionAnalysisRow } from "./analysis";
import { analysisToSessionStatus } from "./analysis";
import type { ProfileRow, SwimmingSessionRow } from "./database.types";

function profileName(p: ProfileRow): string {
  return [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Swimmer";
}

export function mapProfileToSwimmer(
  profile: ProfileRow,
  sessionCount: number,
  lastSessionDate: string | null
): Swimmer {
  return {
    id: profile.id,
    name: profileName(profile),
    age: profile.age ?? 0,
    team: "imu_reader",
    strokeSpecialty: "Freestyle",
    createdAt: profile.created_at ?? new Date().toISOString(),
    totalSessions: sessionCount,
    averageQualityScore: 0,
    lastSessionDate: lastSessionDate ?? profile.created_at ?? new Date().toISOString(),
  };
}

function mapStrokeType(value: string | undefined): StrokeType {
  const v = (value ?? "Freestyle") as StrokeType;
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

export function mapSwimmingSessionToSession(
  row: SwimmingSessionRow,
  analysis?: SessionAnalysisRow | null
): Session {
  const meta = row.session_metadata ?? {};
  const info = row.swimmer_info ?? {};
  const name =
    info.name ??
    ([info.first_name, info.last_name].filter(Boolean).join(" ").trim() || "Swimmer");

  const date = meta.start_time ?? row.created_at ?? new Date().toISOString();
  const status = analysisToSessionStatus(row.analysis_status, !!analysis);
  const strokeType = analysis
    ? mapStrokeType(analysis.primary_stroke)
    : ("Freestyle" as StrokeType);

  return {
    id: row.id,
    swimmerId: row.user_id,
    swimmerName: name,
    date,
    duration: meta.duration_seconds ?? 0,
    distance: 0,
    poolLength: 25,
    status,
    strokeType,
    qualityScore: analysis?.quality_score ?? undefined,
    numStrokes: analysis?.num_strokes ?? undefined,
    createdAt: row.created_at ?? date,
    analyzedAt: row.analyzed_at ?? analysis?.created_at ?? undefined,
  };
}
