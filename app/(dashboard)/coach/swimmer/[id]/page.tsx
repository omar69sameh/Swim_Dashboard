"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useEffect } from "react";
import StrokeScoreCards from "@/components/dashboard/StrokeScoreCards";
import QualityChart from "@/components/dashboard/QualityChart";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useSwimmer, useSessions, useHistoricalData } from "@/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { canAccessSwimmer } from "@/lib/access";
import { getStrokeScoresForSwimmer } from "@/lib/stroke-scores";
import { formatDate, getStrokeEmoji } from "@/lib/utils";

export default function CoachSwimmerPage() {
  const params = useParams();
  const router = useRouter();
  const swimmerId = params.id as string;
  const user = useAuthStore((s) => s.user);

  const { swimmer, isLoading, error, refetch } = useSwimmer(swimmerId);
  const { sessions } = useSessions({ swimmerId });
  const { history, isLoading: historyLoading } = useHistoricalData(swimmerId);

  useEffect(() => {
    if (user && !canAccessSwimmer(user, swimmerId)) {
      router.replace("/coach");
    }
  }, [user, swimmerId, router]);

  if (!isLoading && !swimmer) {
    return (
      <div className="text-center py-12">
        <p className="text-white mb-2">Swimmer not found</p>
        <Link href="/coach" className="text-aqua-300 text-sm">
          Back
        </Link>
      </div>
    );
  }

  const strokeScores = sessions ? getStrokeScoresForSwimmer(swimmerId, sessions) : [];
  const recentSessions = (sessions ?? [])
    .filter((s) => s.status === "completed")
    .slice(0, 5);

  return (
    <>
      <Link
        href="/coach"
        className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      {isLoading && <LoadingState />}
      {error && <ErrorState message={error} onRetry={refetch} />}

      {swimmer && (
        <>
          <div className="glass-card p-4 md:p-5">
            <div className="flex items-center gap-3">
              <span className="text-2xl">{getStrokeEmoji(swimmer.strokeSpecialty)}</span>
              <div>
                <h1 className="text-xl font-display font-bold text-white">{swimmer.name}</h1>
                <p className="text-sm text-slate-500">
                  Overall avg:{" "}
                  <span className="text-aqua-300 font-bold">{swimmer.averageQualityScore}</span>
                </p>
              </div>
            </div>
          </div>

          {strokeScores.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Quality by stroke (tap to open session)</p>
              <StrokeScoreCards
                scores={strokeScores}
                sessionLinkPrefix="/coach/session"
              />
            </div>
          )}

          {!historyLoading && history && history.length > 0 && (
            <QualityChart data={history} compact />
          )}

          <div className="glass-card p-4">
            <h2 className="text-sm font-semibold text-slate-300 mb-3">Recent sessions</h2>
            <ul className="space-y-2">
              {recentSessions.map((session) => (
                <li key={session.id}>
                  <Link
                    href={`/coach/session/${session.id}`}
                    prefetch
                    className="flex justify-between items-center p-3 rounded-lg hover:bg-white/5"
                  >
                    <span className="text-sm text-slate-300 flex items-center gap-2">
                      <span>{getStrokeEmoji(session.strokeType)}</span>
                      {session.strokeType} · {formatDate(session.date)}
                    </span>
                    <span className="text-sm font-bold text-aqua-300">
                      {session.qualityScore ?? "—"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  );
}
