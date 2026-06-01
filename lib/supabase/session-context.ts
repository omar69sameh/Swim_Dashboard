import { createSupabaseServerClient } from "./server";
import { toAuthUser } from "./auth-user";
import { ensureProfileForUser } from "./ensure-profile";
import type { AuthUser } from "@/types/auth";
import { isSupabaseConfigured } from "./env";

export async function getAuthUserFromRequest(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await ensureProfileForUser(user);

  return toAuthUser(user, profile);
}
