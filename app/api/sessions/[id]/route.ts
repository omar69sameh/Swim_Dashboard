import { sessions } from "@/lib/data";
import { isSwimmerAssignedToCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapSwimmingSessionToSession } from "@/lib/supabase/mappers";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { SwimmingSessionRow } from "@/lib/supabase/database.types";
import { NextResponse } from "next/server";

/**
 * GET /api/sessions/:id
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    const session = sessions.find((s) => s.id === id);
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    return NextResponse.json(session);
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("swimming_sessions")
    .select(
      "id, user_id, session_id, swimmer_info, device_info, session_metadata, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const row = data as SwimmingSessionRow;

  if (authUser.role === "swimmer" && row.user_id !== authUser.swimmerId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (authUser.role === "coach") {
    const allowed = await isSwimmerAssignedToCoach(row.user_id, authUser.id);
    if (!allowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  return NextResponse.json(mapSwimmingSessionToSession(row));
}
