import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { apiOk } from "@/lib/api-helpers";

/**
 * POST /api/auth/logout
 */
export async function POST() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  return apiOk({ ok: true });
}
