import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAuthUser } from "@/lib/supabase/auth-user";
import { ensureProfileForUser } from "@/lib/supabase/ensure-profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mockSignIn } from "@/lib/mock-auth";
import { NextRequest, NextResponse } from "next/server";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  if (entry.count >= 10) return true;
  entry.count++;
  return false;
}

/**
 * POST /api/auth/login
 * Supabase Auth signInWithPassword + session cookies
 */
export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for") ?? "unknown";
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  const body = await request.json();
  const email = body.email as string;
  const password = body.password as string;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    const user = mockSignIn(email, password);
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    return NextResponse.json(user);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message ?? "Invalid email or password" },
      { status: 401 }
    );
  }

  const profile = await ensureProfileForUser(data.user);

  return NextResponse.json(toAuthUser(data.user, profile));
}
