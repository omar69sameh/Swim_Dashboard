import { swimmers } from "@/lib/data";
import { NextResponse } from "next/server";

/**
 * GET /api/swimmers/:id
 * Future: Supabase dashboard DB — swimmers table
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const swimmer = swimmers.find((s) => s.id === id);

  if (!swimmer) {
    return NextResponse.json({ error: "Swimmer not found" }, { status: 404 });
  }

  return NextResponse.json(swimmer);
}
