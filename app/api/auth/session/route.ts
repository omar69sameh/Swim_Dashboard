import { NextResponse } from "next/server";

/**
 * GET /api/auth/session
 * Future: validate Supabase session from cookie
 * Mock API mode: client uses localStorage; this returns 401 for unauthenticated server checks
 */
export async function GET() {
  return NextResponse.json({ error: "No server session in mock mode" }, { status: 401 });
}
