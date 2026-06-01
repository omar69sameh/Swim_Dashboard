import { createSupabaseServerClient } from "@/lib/supabase/server";
import { toAuthUser } from "@/lib/supabase/auth-user";
import { ensureProfileForUser } from "@/lib/supabase/ensure-profile";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { mockSignIn } from "@/lib/mock-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/login
 * Supabase Auth signInWithPassword + session cookies
 */
export async function POST(request: NextRequest) {
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
