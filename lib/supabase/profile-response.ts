import type { ProfileRow } from "./database.types";
import type { UserProfile } from "@/types/auth";

export function profileRowToName(row: ProfileRow): string {
  return [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "User";
}

export function buildUserProfile(
  row: ProfileRow,
  email: string,
  coachName: string | null
): UserProfile {
  return {
    id: row.id,
    name: profileRowToName(row),
    email,
    age: row.age,
    role: row.role === "coach" ? "coach" : "swimmer",
    coachId: row.coach_id,
    coachName,
  };
}
