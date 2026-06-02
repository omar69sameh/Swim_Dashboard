import { sessions } from "@/lib/data";
import { getSwimmerIdsForCoach as getMockSwimmerIdsForCoach } from "@/lib/mock-auth";
import { fetchAnalysisMap } from "@/lib/supabase/analysis";
import { getSwimmerIdsForCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapSwimmingSessionToSession } from "@/lib/supabase/mappers";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import type { SwimmingSessionRow } from "@/lib/supabase/database.types";
import { NextRequest, NextResponse } from "next/server";

const SESSION_SELECT =
  "id, user_id, session_id, swimmer_info, device_info, session_metadata, created_at, analysis_status, analyzed_at";

/**
 * GET /api/sessions?swimmerId=&swimmerIds=
 */
export async function GET(request: NextRequest) {
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");
  const swimmerIdsParam = request.nextUrl.searchParams.get("swimmerIds");

  if (!isSupabaseConfigured()) {
    if (swimmerId) {
      return NextResponse.json(sessions.filter((s) => s.swimmerId === swimmerId));
    }
    if (swimmerIdsParam) {
      const ids = swimmerIdsParam.split(",").map((s) => s.trim());
      return NextResponse.json(sessions.filter((s) => ids.includes(s.swimmerId)));
    }
    return NextResponse.json(sessions);
  }

  const authUser = await getAuthUserFromRequest();
  if (!authUser) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  let query = admin.from("swimming_sessions").select(SESSION_SELECT).order("created_at", { ascending: false });

  if (authUser.role === "swimmer") {
    query = query.eq("user_id", authUser.swimmerId!);
  } else if (authUser.role === "coach") {
    const assignedIds = await getSwimmerIdsForCoach(authUser.id);
    if (assignedIds.length === 0) {
      return NextResponse.json([]);
    }
    if (swimmerId) {
      if (!assignedIds.includes(swimmerId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      query = query.eq("user_id", swimmerId);
    } else if (swimmerIdsParam) {
      const ids = swimmerIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      const allowed = ids.filter((id) => assignedIds.includes(id));
      if (allowed.length === 0) return NextResponse.json([]);
      query = query.in("user_id", allowed);
    } else {
      query = query.in("user_id", assignedIds);
    }
  } else if (swimmerId) {
    query = query.eq("user_id", swimmerId);
  } else if (swimmerIdsParam) {
    const ids = swimmerIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
    if (ids.length > 0) query = query.in("user_id", ids);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = data as SwimmingSessionRow[];
  const analysisMap = await fetchAnalysisMap(rows.map((r) => r.id));
  const mapped = rows.map((row) =>
    mapSwimmingSessionToSession(row, analysisMap.get(row.id) ?? null)
  );

  return NextResponse.json(mapped);
}
