import { swimmers } from "@/lib/data";
import { getSwimmerIdsForCoach } from "@/lib/mock-auth";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/swimmers?coachId=&swimmerId=
 * Future: Supabase dashboard DB — swimmers table
 */
export async function GET(request: NextRequest) {
  const coachId = request.nextUrl.searchParams.get("coachId");
  const swimmerId = request.nextUrl.searchParams.get("swimmerId");

  if (swimmerId) {
    const swimmer = swimmers.find((s) => s.id === swimmerId);
    return NextResponse.json(swimmer ? [swimmer] : []);
  }

  if (coachId) {
    const ids = getSwimmerIdsForCoach(coachId);
    return NextResponse.json(swimmers.filter((s) => ids.includes(s.id)));
  }

  return NextResponse.json(swimmers);
}
