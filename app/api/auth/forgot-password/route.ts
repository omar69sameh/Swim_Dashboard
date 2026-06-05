import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextRequest, NextResponse } from "next/server";

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
    // Fetch users in batches and check for matching email
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (error || !data) return false;
    return data.users.some((u) => u.email?.toLowerCase() === email.toLowerCase());
  } catch {
    // If admin check fails, fall through and allow the request
    return true;
  }
}

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await request.json().catch(() => ({}));
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  if (!isSupabaseConfigured()) {
    // Dev mode — silently succeed
    return NextResponse.json({ ok: true });
  }

  const exists = await emailExistsInSystem(email);
  if (!exists) {
    return NextResponse.json(
      { error: "No account found with that email address. Please check and try again." },
      { status: 404 }
    );
  }

  const origin = request.headers.get("origin") ?? "http://localhost:3000";
  const supabase = await createSupabaseServerClient();

  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/callback?next=/reset-password`,
  });

  return NextResponse.json({ ok: true });
}
