import { teamMetrics } from "@/lib/data";
import { NextResponse } from "next/server";

/**
 * GET /api/team-metrics
 * Future: Supabase dashboard DB — aggregated team metrics view
 */
export async function GET() {
  return NextResponse.json(teamMetrics);
}
