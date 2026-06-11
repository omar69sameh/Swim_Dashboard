import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { invalidateProfileCache } from "@/lib/supabase/ensure-profile";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { unauthorized, forbidden, badRequest, serverError, apiOk } from "@/lib/api-helpers";
import { NextRequest } from "next/server";

/**
 * PATCH /api/admin/users/[id]
 * Update a user's profile fields (name, role, age, coachId).
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
  const { name, role, age, coachId } = body as {
    name?: string;
    role?: string;
    age?: number | null;
    coachId?: string | null;
  };

  const admin = createSupabaseAdmin();
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
    if (profileError) return serverError(profileError.message);
  }

  const authUpdates: Record<string, unknown> = {};
  if (role || name) {
    authUpdates.user_metadata = { ...(role ? { role } : {}), ...(name ? { name } : {}) };
  }
  if (Object.keys(authUpdates).length > 0) {
    await admin.auth.admin.updateUserById(id, authUpdates);
  }

  invalidateProfileCache(id);
  return apiOk({ ok: true });
}

/**
 * DELETE /api/admin/users/[id]
 * Cascade-delete: sessions → profile → auth user.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return unauthorized();
  if (currentUser.role !== "admin") return forbidden();

  const { id } = await params;

  if (currentUser.id === id) {
    return badRequest("You cannot delete your own account");
  }

  const admin = createSupabaseAdmin();

  // Step 1: delete sessions (non-fatal if none exist)
  const { error: sessionsError } = await admin
    .from("swimming_sessions")
    .delete()
    .eq("user_id", id);

  if (sessionsError) {
    console.error("Delete sessions error:", sessionsError.message);
  }

  // Step 2: delete profile row
  await admin.from("profiles").delete().eq("id", id);

  // Step 3: delete auth user — prevents re-login and profile recreation
  const { error: authError } = await admin.auth.admin.deleteUser(id);
  if (authError) return serverError(authError.message);

  invalidateProfileCache(id);
  return apiOk({ ok: true });
}
