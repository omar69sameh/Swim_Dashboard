import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { badRequest, unauthorized, serverError, apiOk, apiError } from "@/lib/api-helpers";
import { NextRequest } from "next/server";

/**
 * POST /api/auth/change-password
 */
export async function POST(request: NextRequest) {
  if (!isSupabaseConfigured()) return apiError("Auth not configured", 400);

  const { currentPassword, newPassword } = await request.json();

  if (!currentPassword || !newPassword) return badRequest("Both passwords are required");
  if (newPassword.length < 6) return badRequest("Password must be at least 6 characters");

  const supabase = await createSupabaseServerClient();

  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user?.email) return unauthorized();

  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (signInErr) return badRequest("Current password is incorrect");

  const { error: updateErr } = await supabase.auth.updateUser({ password: newPassword });
  if (updateErr) return serverError(updateErr.message);

  return apiOk({ ok: true });
}
