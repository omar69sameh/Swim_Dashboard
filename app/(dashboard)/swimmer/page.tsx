"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import StrokeScoreCards from "@/components/dashboard/StrokeScoreCards";
import PersonalBestSection from "@/components/dashboard/PersonalBestSection";
import WeeklyVolumeChart from "@/components/dashboard/WeeklyVolumeChart";
import QualityChart from "@/components/dashboard/QualityChart";
import StrokeIcon from "@/components/ui/StrokeIcon";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import { useAuthStore } from "@/lib/auth-store";
import { useSwimmer, useSessions, useHistoricalData } from "@/hooks";
import { getStrokeScoresForSwimmer, getPersonalBestPerStroke, getMonthlyStrokeStats, TRACKED_STROKES } from "@/lib/stroke-scores";
import { formatDate } from "@/lib/utils";

const STROKE_BADGE_COLOR: Record<string, string> = {
  Freestyle:    "bg-cyan-400/10    text-cyan-300    border-cyan-400/20",
  Butterfly:    "bg-violet-400/10  text-violet-300  border-violet-400/20",
  Breaststroke: "bg-emerald-400/10 text-emerald-300 border-emerald-400/20",
  Backstroke:   "bg-amber-400/10   text-amber-300   border-amber-400/20",
  IM:           "bg-rose-400/10    text-rose-300    border-rose-400/20",
};

export default function SwimmerHomePage() {
  const user = useAuthStore((s) => s.user);
  const swimmerId = user?.swimmerId ?? "";

  const { swimmer, isLoading: swimmerLoading, error } = useSwimmer(swimmerId);
  const { sessions, isLoading: sessionsLoading } = useSessions();
  const { history, isLoading: historyLoading } = useHistoricalData(swimmerId);

  const isLoading = swimmerLoading || sessionsLoading;
  const strokeScores = swimmerId && sessions ? getStrokeScoresForSwimmer(swimmerId, sessions) : [];
  const monthlyStats = swimmerId && sessions ? getMonthlyStrokeStats(swimmerId, sessions) : [];
  const personalBests = swimmerId && sessions ? getPersonalBestPerStroke(swimmerId, sessions) : [];
  const pbSessionIds = new Set(personalBests.map((pb) => pb.sessionId));

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
      {/* ── Hero banner ─────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full h-44 md:h-56 rounded-2xl overflow-hidden"
      >
        <Image
          src="/swimming-hero.jpg"
          alt="Competitive swimmer"
          fill
          className="object-cover object-center"
          priority
        />
        {/* gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-ocean-950/90 via-ocean-950/50 to-transparent" />
        <div className="absolute inset-0 flex flex-col justify-end p-5">
          <motion.h1
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="text-2xl md:text-3xl font-display font-bold text-white drop-shadow"
          >
            My Progress
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-slate-300 text-sm mt-1"
          >
            Quality by stroke — Freestyle, Breaststroke, Butterfly
          </motion.p>
        </div>
      </motion.div>

      {isLoading && <LoadingState message="Loading..." />}
      {error && <ErrorState message={error} />}

      {!isLoading && sessions && (
        <>
          {/* ── Stat cards ──────────────────────────────────── */}
          <div className="flex flex-wrap gap-3">
            <motion.div
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35 }}
              className="glass-card px-5 py-3 text-sm flex flex-col items-center gap-0.5 min-w-[90px]"
            >
              <span className="text-2xl font-bold text-white">{totalSessions}</span>
              <span className="text-slate-500 text-xs">Total sessions</span>
            </motion.div>

            {perType.map(({ type, count }, i) => (
              <motion.div
                key={type}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.35, delay: (i + 1) * 0.07 }}
                className={`glass-card px-4 py-3 text-sm flex flex-col items-center gap-1 min-w-[90px] border ${STROKE_BADGE_COLOR[type] ?? "border-white/5"} transition-all hover:scale-105 cursor-default`}
              >
                <span className="group">
                  <StrokeIcon stroke={type} size={22} animated />
                </span>
                <span className="font-bold text-lg leading-none">{count}</span>
                <span className="text-[10px] opacity-70">{type}</span>
              </motion.div>
            ))}
          </div>

          {/* ── Monthly averages ────────────────────────────── */}
          {monthlyStats.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-slate-300 mb-3">
                This month —{" "}
                {new Date().toLocaleString("en-US", { month: "long", year: "numeric" })}
              </h2>
              <div className="flex flex-wrap gap-3">
                {monthlyStats.map(({ strokeType, count, avgScore }) => {
                  const badgeColor = STROKE_BADGE_COLOR[strokeType] ?? "border-white/5";
                  const scoreColor =
                    avgScore >= 75
                      ? "text-emerald-400"
                      : avgScore >= 50
                      ? "text-amber-400"
                      : "text-rose-400";
                  return (
                    <motion.div
                      key={strokeType}
                      initial={{ opacity: 0, scale: 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.3 }}
                      className={`glass-card px-4 py-3 flex flex-col gap-0.5 min-w-[130px] border ${badgeColor}`}
                    >
                      <span className="text-xs text-slate-500">{strokeType}</span>
                      <span className={`text-2xl font-bold leading-none ${scoreColor}`}>
                        {avgScore}
                      </span>
                      <span className="text-[10px] text-slate-500 mt-0.5">
                        avg · {count} session{count > 1 ? "s" : ""}
                      </span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Stroke score cards ──────────────────────────── */}
          {strokeScores.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-2">Latest session per stroke — tap to view</p>
              <StrokeScoreCards
                scores={strokeScores}
                sessionLinkPrefix="/swimmer/session"
                pbSessionIds={pbSessionIds}
              />
            </div>
          )}

          {/* ── Personal Bests ──────────────────────────────── */}
          {personalBests.length > 0 && (
            <PersonalBestSection
              pbs={personalBests}
              sessionLinkPrefix="/swimmer/session"
            />
          )}

          {/* ── Weekly volume chart ─────────────────────────── */}
          <WeeklyVolumeChart sessions={sessions} swimmerId={swimmerId} />

          {/* ── Recent sessions ─────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-300">Sessions — last 30 days</h2>
              <Link
                href="/swimmer/compare"
                className="text-xs text-aqua-300 hover:text-aqua-200 border border-aqua-300/30 rounded-lg px-3 py-1 hover:bg-aqua-300/10 transition-colors"
              >
                Compare sessions
              </Link>
            </div>
            {recentSessions.length === 0 ? (
              <p className="text-sm text-slate-500">No completed sessions in the last 30 days.</p>
            ) : (
              <ul className="space-y-2">
                {recentSessions.map((s, i) => (
                  <motion.li
                    key={s.id}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3, delay: i * 0.06 }}
                  >
                    <Link
                      href={`/swimmer/session/${s.id}`}
                      prefetch
                      className="group flex items-center gap-3 p-3 rounded-xl glass-card border border-transparent hover:border-white/10 hover:bg-ocean-800/60 transition-all duration-200 hover:-translate-y-0.5"
                    >
                      <span className="p-2 rounded-lg bg-white/5 group-hover:bg-white/10 transition-colors">
                        <StrokeIcon stroke={s.strokeType} size={20} animated />
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-200 font-medium">{s.strokeType}</p>
                        <p className="text-xs text-slate-500">{formatDate(s.date)}</p>
                      </div>
                      <div className="flex flex-col items-end shrink-0">
                        <span className="text-aqua-300 font-bold text-sm">
                          {s.qualityScore ?? "—"}
                        </span>
                        <span className="text-[10px] text-slate-600">score</span>
                      </div>
                      <svg className="w-4 h-4 text-slate-600 group-hover:text-slate-400 transition-colors shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}

      {!historyLoading && history && history.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.4 }}
        >
          <QualityChart data={history} compact />
        </motion.div>
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
