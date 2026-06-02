"use client";

import Link from "next/link";
import StrokeScoreCards from "@/components/dashboard/StrokeScoreCards";
import QualityChart from "@/components/dashboard/QualityChart";
import StrokeIcon from "@/components/ui/StrokeIcon";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useAuthStore } from "@/lib/auth-store";
import { useSwimmer, useSessions, useHistoricalData } from "@/hooks";
import { getStrokeScoresForSwimmer } from "@/lib/stroke-scores";
import { TRACKED_STROKES } from "@/lib/stroke-scores";
import { formatDate } from "@/lib/utils";

export default function SwimmerHomePage() {
  const user = useAuthStore((s) => s.user);
  const swimmerId = user?.swimmerId ?? "";

  const { swimmer, isLoading: swimmerLoading, error } = useSwimmer(swimmerId);
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { history, isLoading: historyLoading } = useHistoricalData(swimmerId);

  const isLoading = swimmerLoading || sessionsLoading;
  const strokeScores = swimmerId && sessions ? getStrokeScoresForSwimmer(swimmerId, sessions) : [];

  const oneMonthAgo = new Date();
  oneMonthAgo.setDate(oneMonthAgo.getDate() - 30);

  const recentSessions = sessions
    ? sessions
        .filter(
          (s) =>
            s.swimmerId === swimmerId &&
            s.status === "completed" &&
            new Date(s.date) >= oneMonthAgo
        )
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    : [];

  const totalSessions = sessions
    ? sessions.filter((s) => s.swimmerId === swimmerId && s.status === "completed").length
    : 0;

  const perType = TRACKED_STROKES.map((t) => ({
    type: t,
    count: sessions
      ? sessions.filter(
          (s) => s.swimmerId === swimmerId && s.strokeType === t && s.status === "completed"
        ).length
      : 0,
  }));

  return (
    <>
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white">My progress</h1>
        <p className="text-slate-400 text-sm mt-1">Quality by stroke — Freestyle, Breaststroke, Butterfly</p>
      </div>

      {isLoading && <LoadingState message="Loading..." />}
      {error && <ErrorState message={error} />}

      {!isLoading && sessions && (
        <>
          {/* Session counts */}
          <div className="flex flex-wrap gap-3">
            <div className="glass-card px-4 py-2 text-sm">
              <span className="text-slate-500">Total sessions </span>
              <span className="font-bold text-white">{totalSessions}</span>
            </div>
            {perType.map(({ type, count }) => (
              <div key={type} className="glass-card px-4 py-2 text-sm flex items-center gap-2">
                <StrokeIcon stroke={type} size={16} />
                <span className="text-slate-500">{type} </span>
                <span className="font-bold text-aqua-300">{count}</span>
              </div>
            ))}
          </div>

          {strokeScores.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Tap a stroke to view that session</p>
              <StrokeScoreCards scores={strokeScores} sessionLinkPrefix="/swimmer/session" />
            </div>
          )}

          {/* Recent sessions — last 30 days */}
          <div>
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Sessions — last 30 days</h2>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No completed sessions in the last 30 days.</p>
            ) : (
              <ul className="space-y-2">
                {recentSessions.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/swimmer/session/${s.id}`}
                      prefetch
                      className="flex items-center gap-3 p-3 rounded-lg glass-card-hover border border-transparent hover:border-white/10 transition-colors"
                    >
                      <StrokeIcon stroke={s.strokeType} size={20} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium">{s.strokeType}</p>
                        <p className="text-xs text-slate-500">{formatDate(s.date)}</p>
                      </div>
                      <span className="text-aqua-300 font-bold text-sm shrink-0">
                        {s.qualityScore ?? "—"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {!historyLoading && history && history.length > 0 && (
        <QualityChart data={history} compact />
      )}

      {swimmer && (
        <p className="text-sm text-slate-500 text-center">
          Overall average:{" "}
          <span className="text-aqua-300 font-medium">{swimmer.averageQualityScore}</span>
        </p>
      )}
    </>
  );
}
