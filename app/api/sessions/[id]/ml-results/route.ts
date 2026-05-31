import { generateMLResults, sessions } from "@/lib/data";
import { NextResponse } from "next/server";

/**
 * GET /api/sessions/:id/ml-results
 * Future: Python ML pipeline API or Supabase dashboard DB — ml_results
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

  if (session.status === "pending" || session.status === "processing") {
    return NextResponse.json(
      { error: "Analysis not yet complete", status: session.status },
      { status: 202 }
    );
  }

  if (session.status === "failed") {
    return NextResponse.json(
      { error: "Analysis failed", status: session.status },
      { status: 422 }
    );
  }

  try {
    const results = generateMLResults(id, { lite: true });
    return NextResponse.json(results);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to generate ML results";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
