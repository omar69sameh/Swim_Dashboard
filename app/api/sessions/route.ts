import { sessions } from "@/lib/data";
import { getSwimmerIdsForCoach as getMockSwimmerIdsForCoach } from "@/lib/mock-auth";
import { fetchAnalysisMap } from "@/lib/supabase/analysis";
import { getSwimmerIdsForCoach } from "@/lib/supabase/coach-assignments";
import { createSupabaseAdmin } from "@/lib/supabase/admin";
import { mapSwimmingSessionToSession } from "@/lib/supabase/mappers";
import { getAuthUserFromRequest } from "@/lib/supabase/session-context";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { unauthorized, forbidden, serverError, apiOk } from "@/lib/api-helpers";
import type { SwimmingSessionRow } from "@/lib/supabase/database.types";
import { NextRequest } from "next/server";

const SESSION_SELECT =
  "id, user_id, session_id, swimmer_info, device_info, session_metadata, created_at, analysis_status, analyzed_at";

/**
 * GET /api/sessions?swimmerId=&swimmerIds=
 */
export async function GET(request: NextRequest) {
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");
  const swimmerIdsParam = request.nextUrl.searchParams.get("swimmerIds");

  const authUser = await getAuthUserFromRequest();
  if (!authUser) return unauthorized();

  if (!isSupabaseConfigured()) {
    if (authUser.role === "swimmer") {
      const ownId = authUser.swimmerId ?? authUser.id;
      return apiOk(sessions.filter((s) => s.swimmerId === ownId));
    }
    if (authUser.role === "coach") {
      const assignedIds = getMockSwimmerIdsForCoach(authUser.coachId ?? "");
      if (swimmerId) {
        if (!assignedIds.includes(swimmerId)) return forbidden();
        return apiOk(sessions.filter((s) => s.swimmerId === swimmerId));
      }
      if (swimmerIdsParam) {
        const requested = swimmerIdsParam.split(",").map((s) => s.trim());
        const allowed = requested.filter((id) => assignedIds.includes(id));
        return apiOk(sessions.filter((s) => allowed.includes(s.swimmerId)));
      }
      return apiOk(sessions.filter((s) => assignedIds.includes(s.swimmerId)));
    }
    if (swimmerId) return apiOk(sessions.filter((s) => s.swimmerId === swimmerId));
    if (swimmerIdsParam) {
      const ids = swimmerIdsParam.split(",").map((s) => s.trim());
      return apiOk(sessions.filter((s) => ids.includes(s.swimmerId)));
    }
    return apiOk(sessions);
  }

  const admin = createSupabaseAdmin();
  let query = admin
    .from("swimming_sessions")
    .select(SESSION_SELECT)
    .order("created_at", { ascending: false });

  if (authUser.role === "swimmer") {
    query = query.eq("user_id", authUser.swimmerId!);
  } else if (authUser.role === "coach") {
    const assignedIds = await getSwimmerIdsForCoach(authUser.id);
    if (assignedIds.length === 0) return apiOk([]);

    if (swimmerId) {
      if (!assignedIds.includes(swimmerId)) return forbidden();
      query = query.eq("user_id", swimmerId);
    } else if (swimmerIdsParam) {
      const ids = swimmerIdsParam.split(",").map((s) => s.trim()).filter(Boolean);
      const allowed = ids.filter((id) => assignedIds.includes(id));
      if (allowed.length === 0) return apiOk([]);
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
  if (error) return serverError(error.message);

  const rows = data as SwimmingSessionRow[];
  const analysisMap = await fetchAnalysisMap(rows.map((r) => r.id));
  const mapped = rows.map((row) => mapSwimmingSessionToSession(row, analysisMap.get(row.id) ?? null));

  return apiOk(mapped);
}
