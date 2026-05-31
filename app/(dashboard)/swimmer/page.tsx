"use client";

import Link from "next/link";
import StrokeScoreCards from "@/components/dashboard/StrokeScoreCards";
import QualityChart from "@/components/dashboard/QualityChart";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useAuthStore } from "@/lib/auth-store";
import { useSwimmer, useSessions, useHistoricalData } from "@/hooks";
import { getStrokeScoresForSwimmer, getLastSessionForSwimmer } from "@/lib/stroke-scores";
import { formatDate, getStrokeEmoji } from "@/lib/utils";

export default function SwimmerHomePage() {
  const user = useAuthStore((s) => s.user);
  const swimmerId = user?.swimmerId ?? "";

  const { swimmer, isLoading: swimmerLoading, error } = useSwimmer(swimmerId);
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { history, isLoading: historyLoading } = useHistoricalData(swimmerId);

  const isLoading = swimmerLoading || sessionsLoading;
  const strokeScores = swimmerId && sessions ? getStrokeScoresForSwimmer(swimmerId, sessions) : [];
  const lastSession = sessions ? getLastSessionForSwimmer(swimmerId, sessions) : undefined;

  return (
    <>
      <div>
        <h1 className="text-2xl md:text-3xl font-display font-bold text-white">My progress</h1>
        <p className="text-slate-400 text-sm mt-1">
          Quality by stroke — Freestyle, Breaststroke, Butterfly
        </p>
      </div>

      {isLoading && <LoadingState message="Loading..." />}

      {error && <ErrorState message={error} />}

      {!isLoading && sessions && strokeScores.length > 0 && (
        <>
          <div>
            <p className="text-xs text-slate-500 mb-2">Tap a stroke to view that session</p>
            <StrokeScoreCards scores={strokeScores} sessionLinkPrefix="/swimmer/session" />
          </div>

          {lastSession && (
            <div className="glass-card p-5">
              <p className="text-xs text-slate-500 mb-1">Most recent session</p>
              <div className="flex items-center gap-2">
                <span>{getStrokeEmoji(lastSession.strokeType)}</span>
                <span className="text-slate-300">{lastSession.strokeType}</span>
                <span className="text-aqua-300 font-bold ml-auto">{lastSession.qualityScore}</span>
              </div>
              <p className="text-sm text-slate-500 mt-1">{formatDate(lastSession.date)}</p>
              <Link
                href={`/swimmer/session/${lastSession.id}`}
                prefetch
                className="inline-flex mt-4 px-4 py-2 rounded-lg bg-aqua-500/20 text-aqua-300 text-sm font-medium hover:bg-aqua-500/30 transition-colors"
              >
                View session details
              </Link>
            </div>
          )}
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
