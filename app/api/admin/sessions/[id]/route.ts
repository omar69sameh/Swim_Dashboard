import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { NextRequest, NextResponse } from "next/server";

function forbidden() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

/**
 * PATCH /api/admin/sessions/[id]
 * Update a session's date/time.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const { date } = body as { date?: string };

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const iso = new Date(date).toISOString();
  const admin = createSupabaseAdmin();

  // Fetch existing session_metadata so we only update start_time, not wipe other fields
  const { data: existing } = await admin
    .from("swimming_sessions")
    .select("session_metadata")
    .eq("id", id)
    .maybeSingle();

  const existingMeta = (existing as Record<string, unknown> | null)?.session_metadata ?? {};
  const mergedMeta = { ...(existingMeta as object), start_time: iso };

  const { error } = await admin
    .from("swimming_sessions")
    .update({
      session_metadata: mergedMeta,
      analyzed_at: iso,
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, date: iso });
}

/**
 * DELETE /api/admin/sessions/[id]
 * Deletes a session and everything linked to it:
 *   session_strokes → session_analysis → swimming_sessions
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const admin = createSupabaseAdmin();

  // Delete strokes first (FK child)
  await admin.from("session_strokes").delete().eq("session_id", id);

  // Delete analysis
  await admin.from("session_analysis").delete().eq("session_id", id);

  // Delete the session itself
  const { error } = await admin.from("swimming_sessions").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
