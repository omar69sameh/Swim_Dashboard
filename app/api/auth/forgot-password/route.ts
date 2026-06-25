import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { badRequest, notFound, apiOk, apiError } from "@/lib/api-helpers";
import { NextRequest } from "next/server";

const attempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt < now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 3) return true;
  entry.count++;
  return false;
}

async function emailExistsInSystem(email: string): Promise<boolean> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return false;
    return data.users.some((u) => u.email?.toLowerCase() === email.toLowerCase());
  } catch {
    return true;
  }
}

/**
 * POST /api/auth/forgot-password
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) return apiError("Too many attempts. Try again in a minute.", 429);

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return badRequest("Email required");

  if (!isSupabaseConfigured()) return apiOk({ ok: true });

  const exists = await emailExistsInSystem(email);
  if (!exists) return notFound("Account");

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return apiOk({ ok: true });
}
