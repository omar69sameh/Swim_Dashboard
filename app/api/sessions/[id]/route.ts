import { sessions } from "@/lib/data";
import { NextResponse } from "next/server";

/**
 * GET /api/sessions/:id
 * Future: Supabase dashboard DB — sessions table
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = sessions.find((s) => s.id === id);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  return NextResponse.json(session);
}
