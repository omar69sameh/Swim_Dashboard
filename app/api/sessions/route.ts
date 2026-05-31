import { sessions } from "@/lib/data";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/sessions?swimmerId=&swimmerIds=id1,id2
 * Future: Supabase dashboard DB — sessions table
 */
export async function GET(request: NextRequest) {
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");
  const swimmerIdsParam = request.nextUrl.searchParams.get("swimmerIds");

  if (swimmerId) {
    return NextResponse.json(sessions.filter((s) => s.swimmerId === swimmerId));
  }

  if (swimmerIdsParam) {
    const ids = swimmerIdsParam.split(",").map((s) => s.trim());
    return NextResponse.json(sessions.filter((s) => ids.includes(s.swimmerId)));
  }

  return NextResponse.json(sessions);
}
