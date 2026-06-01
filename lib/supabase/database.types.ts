export type ProfileRole = "coach" | "swimmer";

export interface ProfileRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  age: number | null;
  role: ProfileRole | null;
  coach_id: string | null;
  created_at: string | null;
}

export interface CoachOption {
  id: string;
  name: string;
}

export interface SwimmingSessionRow {
  id: string;
  user_id: string;
  session_id: string | null;
  swimmer_info: {
    name?: string;
    first_name?: string;
    last_name?: string;
    age?: number;
    email?: string;
  } | null;
  device_info: Record<string, unknown> | null;
  session_metadata: {
    start_time?: string;
    end_time?: string;
    duration_seconds?: number;
    sample_count?: number;
  } | null;
  created_at: string | null;
}
