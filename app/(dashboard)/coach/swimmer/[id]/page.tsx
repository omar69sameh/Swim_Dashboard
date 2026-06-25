"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { motion } from "framer-motion";
import { useEffect } from "react";
import StrokeScoreCards from "@/components/dashboard/StrokeScoreCards";
import PersonalBestSection from "@/components/dashboard/PersonalBestSection";
import WeeklyVolumeChart from "@/components/dashboard/WeeklyVolumeChart";
import QualityChart from "@/components/dashboard/QualityChart";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useSwimmer, useSessions, useHistoricalData, useSwimmers } from "@/hooks";
import { useAuthStore } from "@/lib/auth-store";
import { canAccessSwimmer } from "@/lib/access";
import { getStrokeScoresForSwimmer, getPersonalBestPerStroke, getMonthlyStrokeStats } from "@/lib/stroke-scores";
import { formatDate, getStrokeEmoji } from "@/lib/utils";

export default function CoachSwimmerPage() {
  const params = useParams();
  const router = useRouter();
  const swimmerId = params.id as string;
  const user = useAuthStore((s) => s.user);

  const { swimmers: assignedSwimmers } = useSwimmers();
  const { swimmer, isLoading, error, refetch } = useSwimmer(swimmerId);
  const { sessions } = useSessions({ swimmerId });
  const { history, isLoading: historyLoading } = useHistoricalData(swimmerId);

  useEffect(() => {
    if (!user || !assignedSwimmers) return;
    const assignedIds = assignedSwimmers.map((s) => s.id);
    if (!canAccessSwimmer(user, swimmerId, assignedIds)) {
      router.replace("/coach");
    }
  }, [user, swimmerId, assignedSwimmers, router]);

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
  const monthlyStats = sessions ? getMonthlyStrokeStats(swimmerId, sessions) : [];
  const personalBests = sessions ? getPersonalBestPerStroke(swimmerId, sessions) : [];
  const pbSessionIds = new Set(personalBests.map((pb) => pb.sessionId));
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

          {monthlyStats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                This month —{" "}
                {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex flex-wrap gap-3">
                {monthlyStats.map(({ strokeType, count, avgScore }) => {
                  const scoreColor =
                    avgScore >= 75 ? "text-emerald-400" : avgScore >= 50 ? "text-amber-400" : "text-rose-400";
                  return (
                    <motion.div
                      key={strokeType}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className="glass-card px-4 py-3 flex flex-col gap-0.5 min-w-[130px] border border-white/10"
                    >
                      <span className="text-xs text-slate-500">{strokeType}</span>
                      <span className={`text-2xl font-bold leading-none ${scoreColor}`}>{avgScore}</span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        avg · {count} session{count > 1 ? "s" : ""}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {strokeScores.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Latest session per stroke — tap to open</p>
              <StrokeScoreCards
                scores={strokeScores}
                sessionLinkPrefix="/coach/session"
                pbSessionIds={pbSessionIds}
              />
            </div>
          )}

          {personalBests.length > 0 && (
            <PersonalBestSection
              pbs={personalBests}
              sessionLinkPrefix="/coach/session"
            />
          )}

          {sessions && sessions.length > 0 && (
            <WeeklyVolumeChart sessions={sessions} swimmerId={swimmerId} />
          )}

          {!historyLoading && history && history.length > 0 && (
            <QualityChart data={history} compact />
          )}

          <div className="glass-card p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300">Recent sessions</h2>
              <Link
                href="/coach/compare"
                className="text-xs text-aqua-300 hover:text-aqua-200 border border-aqua-300/30 rounded-lg px-3 py-1 hover:bg-aqua-300/10 transition-colors"
              >
                Compare sessions
              </Link>
            </div>
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
