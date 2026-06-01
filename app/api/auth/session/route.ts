import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

/**
 * GET /api/auth/session
 * Returns current user from Supabase session cookie
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: "No server session in mock mode" }, { status: 401 });
  }

  const user = await getAuthUserFromRequest();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  return NextResponse.json(user);
}
