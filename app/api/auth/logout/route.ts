import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * Future: clear Supabase session cookie
 */
export async function POST() {
  return NextResponse.json({ ok: true });
}
