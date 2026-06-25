import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAnalysisMap } from "./analysis";
import type { SwimmingSessionRow } from "./database.types";

export interface SwimmerStats {
  count: number;
  lastDate: string | null;
  averageQualityScore: number | null;
}

/**
 * Computes per-swimmer session stats (count, last date, avg quality score)
 * for the given set of profile IDs.
 *
 * Extracted here to keep the /api/swimmers route handler lean (SRP).
 */
export async function computeSwimmerStats(
  admin: SupabaseClient,
  profileIds: string[]
): Promise<Map<string, SwimmerStats>> {
  if (profileIds.length === 0) return new Map();

  const { data: sessionRows } = await admin
    .from("swimming_sessions")
    .select("id, user_id, created_at, session_metadata, analysis_status")
    .in("user_id", profileIds);

  const rows = (sessionRows ?? []) as Pick<
    SwimmingSessionRow,
    "id" | "user_id" | "created_at" | "session_metadata" | "analysis_status"
  >[];

  const analysisMap = await fetchAnalysisMap(rows.map((r) => r.id));

  const acc = new Map<
    string,
    { count: number; lastDate: string | null; qualitySum: number; qualityCount: number }
  >();

  for (const row of rows) {
    const date = row.session_metadata?.start_time ?? row.created_at ?? null;
    const analysis = analysisMap.get(row.id);
    const score = analysis?.quality_score ?? null;
    const hasScore = (row.analysis_status === "completed" || analysis != null) && score != null;

    const prev = acc.get(row.user_id);
    if (!prev) {
      acc.set(row.user_id, {
        count: 1,
        lastDate: date,
        qualitySum: hasScore ? score! : 0,
        qualityCount: hasScore ? 1 : 0,
      });
    } else {
      const lastDate =
        prev.lastDate && date && new Date(date) > new Date(prev.lastDate)
          ? date
          : prev.lastDate ?? date;
      acc.set(row.user_id, {
        count: prev.count + 1,
        lastDate,
        qualitySum: prev.qualitySum + (hasScore ? score! : 0),
        qualityCount: prev.qualityCount + (hasScore ? 1 : 0),
      });
    }
  }

  const result = new Map<string, SwimmerStats>();
  for (const [id, s] of acc) {
    result.set(id, {
      count: s.count,
      lastDate: s.lastDate,
      averageQualityScore:
        s.qualityCount > 0
          ? Math.round((s.qualitySum / s.qualityCount) * 10) / 10
          : null,
    });
  }
  return result;
}
