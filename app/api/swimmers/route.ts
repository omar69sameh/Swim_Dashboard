import { swimmers } from "@/lib/data";
import { getSwimmerIdsForCoach as getMockSwimmerIdsForCoach } from "@/lib/mock-auth";
import { getSwimmerIdsForCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapProfileToSwimmer } from "@/lib/supabase/mappers";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { ProfileRow, SwimmingSessionRow } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";

const PROFILE_SELECT = "id, first_name, last_name, age, role, coach_id, created_at";

/**
 * GET /api/swimmers
 * Supabase profiles + session counts; coaches see assigned swimmers only
 */
export async function GET(request: NextRequest) {
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");
  const coachId = request.nextUrl.searchParams.get("coachId");

  if (!isSupabaseConfigured()) {
    if (swimmerId) {
      const swimmer = swimmers.find((s) => s.id === swimmerId);
      return NextResponse.json(swimmer ? [swimmer] : []);
    }
    if (coachId) {
      const ids = getMockSwimmerIdsForCoach(coachId);
      return NextResponse.json(swimmers.filter((s) => ids.includes(s.id)));
    }
    return NextResponse.json(swimmers);
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();

  let profileQuery = admin.from("profiles").select(PROFILE_SELECT);

  if (authUser.role === "swimmer") {
    profileQuery = profileQuery.eq("id", authUser.swimmerId!);
  } else if (authUser.role === "coach") {
    profileQuery = profileQuery.eq("coach_id", authUser.id).eq("role", "swimmer");
  } else if (swimmerId) {
    profileQuery = profileQuery.eq("id", swimmerId);
  }

  const { data: profiles, error: profileError } = await profileQuery;

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profileIds = (profiles as ProfileRow[]).map((p) => p.id);
  if (profileIds.length === 0) {
    return NextResponse.json([]);
  }

  const { data: sessionRows } = await admin
    .from("swimming_sessions")
    .select("user_id, created_at, session_metadata")
    .in("user_id", profileIds);

  const sessionStats = new Map<string, { count: number; lastDate: string | null }>();
  for (const row of (sessionRows ?? []) as Pick<SwimmingSessionRow, "user_id" | "created_at" | "session_metadata">[]) {
    const date = row.session_metadata?.start_time ?? row.created_at ?? null;
    const prev = sessionStats.get(row.user_id);
    if (!prev) {
      sessionStats.set(row.user_id, { count: 1, lastDate: date });
    } else {
      const lastDate =
        prev.lastDate && date && new Date(date) > new Date(prev.lastDate)
          ? date
          : prev.lastDate ?? date;
      sessionStats.set(row.user_id, { count: prev.count + 1, lastDate });
    }
  }

  const list = (profiles as ProfileRow[]).map((p) => {
    const stats = sessionStats.get(p.id);
    return mapProfileToSwimmer(p, stats?.count ?? 0, stats?.lastDate ?? null);
  });

  return NextResponse.json(list);
}
