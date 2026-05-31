import { mockSignUp } from "@/lib/mock-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/signup
 * Future: Supabase Auth signUp
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const user = mockSignUp({
      email: body.email,
      password: body.password,
      name: body.name,
      role: body.role,
    });
    return NextResponse.json(user);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign up failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
