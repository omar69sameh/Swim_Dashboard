import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServiceRoleKey, getSupabaseUrl } from "./env";

let admin: SupabaseClient | null = null;

/** Server-only client — bypasses RLS for BFF routes */
export function createSupabaseAdmin(): SupabaseClient {
  if (!admin) {
    admin = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}
