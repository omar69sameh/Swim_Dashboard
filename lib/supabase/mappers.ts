import type { Session, StrokeType, Swimmer } from "@/types";
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

export function mapSwimmingSessionToSession(row: SwimmingSessionRow): Session {
  const meta = row.session_metadata ?? {};
  const info = row.swimmer_info ?? {};
  const name =
    info.name ??
    ([info.first_name, info.last_name].filter(Boolean).join(" ").trim() || "Swimmer");

  const date = meta.start_time ?? row.created_at ?? new Date().toISOString();

  return {
    id: row.id,
    swimmerId: row.user_id,
    swimmerName: name,
    date,
    duration: meta.duration_seconds ?? 0,
    distance: 0,
    poolLength: 25,
    status: "pending",
    strokeType: "Freestyle" as StrokeType,
    createdAt: row.created_at ?? date,
  };
}
