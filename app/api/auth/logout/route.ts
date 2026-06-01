import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

/**
 * POST /api/auth/logout
 * Clears Supabase session cookies
 */
export async function POST() {
  if (isSupabaseConfigured()) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }

  return NextResponse.json({ ok: true });
}
