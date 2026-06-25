import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, apiOk, apiError } from "@/lib/api-helpers";

/**
 * GET /api/auth/session
 */
export async function GET() {
  if (!isSupabaseConfigured()) return apiError("No server session in mock mode", 401);

  const user = await getAuthUserFromRequest();
  if (!user) return unauthorized();

  return apiOk(user);
}
