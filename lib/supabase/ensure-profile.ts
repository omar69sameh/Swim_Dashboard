import type { User } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "./admin";
import type { ProfileRow } from "./database.types";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

// Per-user profile cache. Profiles change rarely, but every API request
// re-resolved them with 1–2 DB round-trips, which dominated response time.
const profileCache = new Map<string, { profile: ProfileRow | null; expiresAt: number }>();
const PROFILE_CACHE_TTL_MS = 60_000;

export function invalidateProfileCache(userId?: string) {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
}

/** Creates or patches profile so mobile-only signups work on the dashboard too */
export async function ensureProfileForUser(user: User): Promise<ProfileRow | null> {
  const cached = profileCache.get(user.id);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.profile;
  }

  const profile = await resolveProfile(user);
  profileCache.set(user.id, { profile, expiresAt: Date.now() + PROFILE_CACHE_TTL_MS });
  return profile;
}

async function resolveProfile(user: User): Promise<ProfileRow | null> {
  const admin = createSupabaseAdmin();
  const { data: existing, error: readError } = await admin
    .from("profiles")
    .select(PROFILE_SELECT)
    .eq("id", user.id)
    .maybeSingle();

  if (readError) {
    console.error("ensureProfileForUser read:", readError.message);
    return existing as ProfileRow | null;
  }

  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const metaName = typeof metadata.name === "string" ? metadata.name.trim() : "";
  const emailName = (user.email ?? "user").split("@")[0] ?? "User";
  const fullName = metaName || emailName;
  const parts = fullName.split(/\s+/);
  const first_name = parts[0] ?? fullName;
  const last_name = parts.slice(1).join(" ") || null;

  const roleFromMeta = metadata.role === "coach" ? "coach" : "swimmer";

  if (!existing) {
    const { data: created, error: insertError } = await admin
      .from("profiles")
      .upsert({
        id: user.id,
        first_name,
        last_name,
        age: null,
        role: roleFromMeta,
        coach_id: null,
      })
      .select(PROFILE_SELECT)
      .single();

    if (insertError) {
      console.error("ensureProfileForUser insert:", insertError.message);
      return null;
    }
    return created as ProfileRow;
  }

  const row = existing as ProfileRow;
  const updates: Partial<ProfileRow> = {};

  if (!row.role) updates.role = roleFromMeta;
  if (!row.first_name && first_name) updates.first_name = first_name;
  if (!row.last_name && last_name) updates.last_name = last_name;

  if (Object.keys(updates).length === 0) {
    return row;
  }

  const { data: updated, error: updateError } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", user.id)
    .select(PROFILE_SELECT)
    .single();

  if (updateError) {
    console.error("ensureProfileForUser update:", updateError.message);
    return row;
  }

  return updated as ProfileRow;
}
