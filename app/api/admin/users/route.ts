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
 * GET /api/admin/users
 * List all users with profile info + session count
 */
export async function GET() {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return unauthorized();
  if (currentUser.role !== "admin") return forbidden();

  const admin = createSupabaseAdmin();

  // Fetch all auth users
  const { data: authData, error: authError } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 500 });
  }

  // Fetch all profiles
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, first_name, last_name, age, role, coach_id, created_at");

  // Fetch session counts per user
  const { data: sessionCounts } = await admin
    .from("swimming_sessions")
    .select("user_id");

  const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id, p]));
  const countMap = new Map<string, number>();
  for (const row of sessionCounts ?? []) {
    const uid = (row as Record<string, unknown>).user_id as string;
    countMap.set(uid, (countMap.get(uid) ?? 0) + 1);
  }

  const users = authData.users.map((u) => {
    const profile = profileMap.get(u.id) as Record<string, unknown> | undefined;
    const firstName = (profile?.first_name as string) ?? "";
    const lastName = (profile?.last_name as string) ?? "";
    return {
      id: u.id,
      email: u.email ?? "",
      name: ([firstName, lastName].filter(Boolean).join(" ") || u.email?.split("@")[0]) ?? "—",
      role: (profile?.role as string) ?? "swimmer",
      age: (profile?.age as number | null) ?? null,
      coachId: (profile?.coach_id as string | null) ?? null,
      sessionCount: countMap.get(u.id) ?? 0,
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      confirmed: !!u.email_confirmed_at,
    };
  });

  return NextResponse.json({ users });
}

/**
 * POST /api/admin/users
 * Create a new user (auth + profile)
 */
export async function POST(request: NextRequest) {
  const currentUser = await getAuthUserFromRequest();
  if (!currentUser) return unauthorized();
  if (currentUser.role !== "admin") return forbidden();

  const body = await request.json().catch(() => ({}));
  const { email, password, name, role, age, coachId } = body as {
    email?: string;
    password?: string;
    name?: string;
    role?: string;
    age?: number;
    coachId?: string;
  };

  if (!email || !password || !name || !role) {
    return NextResponse.json({ error: "email, password, name, role are required" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Create auth user
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (error || !data.user) {
    return NextResponse.json({ error: error?.message ?? "Failed to create user" }, { status: 400 });
  }

  const parts = name.trim().split(/\s+/);
  const first_name = parts[0] ?? name;
  const last_name = parts.slice(1).join(" ") || null;

  // Create profile
  await admin.from("profiles").upsert({
    id: data.user.id,
    first_name,
    last_name,
    age: role === "swimmer" && age ? age : null,
    role,
    coach_id: role === "swimmer" && coachId ? coachId : null,
  });

  return NextResponse.json({ ok: true, userId: data.user.id });
}
