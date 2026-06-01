import { listCoaches } from "@/lib/supabase/coach-assignments";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { NextResponse } from "next/server";

/**
 * GET /api/coaches
 * Public list of coaches for signup dropdown
 */
export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json([]);
  }

  const coaches = await listCoaches();
  return NextResponse.json(coaches);
}
