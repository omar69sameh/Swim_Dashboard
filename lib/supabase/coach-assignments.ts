import { createSupabaseAdmin } from "./admin";
import type { ProfileRow } from "./database.types";

export async function getSwimmerIdsForCoach(coachId: string): Promise<string[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("coach_id", coachId)
    .eq("role", "swimmer");

  if (error) {
    console.error("getSwimmerIdsForCoach:", error.message);
    return [];
  }

  return (data ?? []).map((row) => row.id as string);
}

export async function isSwimmerAssignedToCoach(
  swimmerId: string,
  coachId: string
): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("id", swimmerId)
    .eq("coach_id", coachId)
    .eq("role", "swimmer")
    .maybeSingle();

  if (error) return false;
  return !!data;
}

export async function listCoaches(): Promise<{ id: string; name: string }[]> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id, first_name, last_name")
    .eq("role", "coach")
    .order("first_name", { ascending: true });

  if (error) {
    console.error("listCoaches:", error.message);
    return [];
  }

  return (data as ProfileRow[]).map((p) => ({
    id: p.id,
    name: [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || "Coach",
  }));
}

export async function validateCoachId(coachId: string): Promise<boolean> {
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("id", coachId)
    .eq("role", "coach")
    .maybeSingle();

  return !error && !!data;
}
