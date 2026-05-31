import { mockSignIn } from "@/lib/mock-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/login
 * Future: Supabase Auth signInWithPassword
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const email = body.email as string;
  const password = body.password as string;

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  }

  const user = mockSignIn(email, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  return NextResponse.json(user);
}
