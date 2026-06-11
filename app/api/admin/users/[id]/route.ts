import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { NextRequest, NextResponse } from "next/server";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}
function forbidden() {
  return NextResponse.json({ error: "Forbidden: admin only" }, { status: 403 });
}

/**
 * PATCH /api/admin/users/[id]
 * Update a user's profile fields
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return unauthorized();
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const { name, role, age, coachId, email } = body as {
    name?: string;
    role?: string;
    age?: number | null;
    coachId?: string | null;
    email?: string;
  };

  const admin = createSupabaseAdmin();

  // Update profile
  const profileUpdates: Record<string, unknown> = {};
  if (name) {
    const parts = name.trim().split(/\s+/);
    profileUpdates.first_name = parts[0] ?? name;
    profileUpdates.last_name = parts.slice(1).join(" ") || null;
  }
  if (role) profileUpdates.role = role;
  if (age !== undefined) profileUpdates.age = age;
  if (coachId !== undefined) profileUpdates.coach_id = coachId;

  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await admin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", id);
    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }
  }

  // Update auth user metadata if email or role changed
  const authUpdates: Record<string, unknown> = {};
  if (email) authUpdates.email = email;
  if (role || name) {
    authUpdates.user_metadata = { ...(role ? { role } : {}), ...(name ? { name } : {}) };
  }
  if (Object.keys(authUpdates).length > 0) {
    await admin.auth.admin.updateUserById(id, authUpdates);
  }

  return NextResponse.json({ ok: true });
}

/**
 * DELETE /api/admin/users/[id]
 * Properly delete: sessions → profile → auth user
 * This is the CORRECT delete that removes the user from auth.users so they CANNOT sign in again.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return unauthorized();
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;

  // Prevent self-deletion
  if (currentUser.id === id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Step 1: Delete all sessions for this user
  const { error: sessionsError } = await admin
    .from("swimming_sessions")
    .delete()
    .eq("user_id", id);

  if (sessionsError) {
    console.error("Delete sessions error:", sessionsError.message);
    // Non-fatal — continue with user deletion
  }

  // Step 2: Delete profile row
  await admin.from("profiles").delete().eq("id", id);

  // Step 3: Delete from auth.users — THIS is the critical step.
  // Without this, the user can still sign in and the profile gets auto-recreated.
  const { error: authError } = await admin.auth.admin.deleteUser(id);

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
