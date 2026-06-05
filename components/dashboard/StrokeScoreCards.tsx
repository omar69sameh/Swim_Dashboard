"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { StrokeQualityScore } from "@/types";
import StrokeIcon from "@/components/ui/StrokeIcon";
import { cn } from "@/lib/utils";

interface StrokeScoreCardsProps {
  scores: StrokeQualityScore[];
  sessionLinkPrefix: string;
  compact?: boolean;
  pbSessionIds?: Set<string>;
}

const STROKE_RING: Record<string, string> = {
  Freestyle:    "stroke-cyan-400",
  Butterfly:    "stroke-violet-400",
  Breaststroke: "stroke-emerald-400",
  Backstroke:   "stroke-amber-400",
  IM:           "stroke-rose-400",
};

const STROKE_BG: Record<string, string> = {
  Freestyle:    "hover:border-cyan-400/30 hover:shadow-cyan-400/10",
  Butterfly:    "hover:border-violet-400/30 hover:shadow-violet-400/10",
  Breaststroke: "hover:border-emerald-400/30 hover:shadow-emerald-400/10",
  Backstroke:   "hover:border-amber-400/30 hover:shadow-amber-400/10",
  IM:           "hover:border-rose-400/30 hover:shadow-rose-400/10",
};

function ScoreRing({ score, stroke }: { score: number; stroke: string }) {
  const radius = 22;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.min(Math.max(score, 0), 100) / 100;
  const dash = pct * circumference;
  const ringClass = STROKE_RING[stroke] ?? "stroke-aqua-300";

  return (
    <div className="relative inline-flex items-center justify-center w-14 h-14 mx-auto mb-2">
      <svg width="56" height="56" viewBox="0 0 56 56" className="-rotate-90">
        <circle cx="28" cy="28" r={radius} strokeWidth="3" className="stroke-white/10 fill-none" />
        <motion.circle
          cx="28" cy="28" r={radius}
          strokeWidth="3"
          fill="none"
          strokeLinecap="round"
          className={ringClass}
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - dash }}
          transition={{ duration: 1, ease: "easeOut", delay: 0.3 }}
        />
      </svg>
      <span className="absolute text-xs font-bold text-white">{score}</span>
    </div>
  );
}

export default function StrokeScoreCards({
  scores,
  sessionLinkPrefix,
  compact = false,
  pbSessionIds,
}: StrokeScoreCardsProps) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
      {scores.map((item, i) => {
        const hasSession = item.lastSessionId && item.qualityScore > 0;
        const hoverBg = STROKE_BG[item.strokeType] ?? "";
        const isPB = !!(item.lastSessionId && pbSessionIds?.has(item.lastSessionId));

        const content = (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className={cn(
              "group glass-card p-3 md:p-4 text-center transition-all duration-300 border border-white/5 relative",
              hasSession && cn("glass-card-hover cursor-pointer shadow-lg", hoverBg)
            )}
          >
            {isPB && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.6, type: "spring", stiffness: 300 }}
                className="absolute top-2 right-2 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/20 border border-amber-400/40 text-amber-300"
              >
                PB
              </motion.span>
            )}
            <span className="flex justify-center mb-1 group">
              <StrokeIcon stroke={item.strokeType} size={32} animated={!!hasSession} />
            </span>
            <p className="text-xs text-slate-500 truncate mb-2">{item.strokeType}</p>

            {hasSession ? (
              <ScoreRing score={item.qualityScore} stroke={item.strokeType} />
            ) : (
              <p className="text-2xl font-bold text-slate-600 mt-1">—</p>
            )}

            {hasSession && item.numStrokes != null && (
              <p className="text-[10px] text-slate-500 mt-1">{item.numStrokes} strokes</p>
            )}
          </motion.div>
        );

        if (hasSession && item.lastSessionId) {
          return (
            <Link key={item.strokeType} href={`${sessionLinkPrefix}/${item.lastSessionId}`} prefetch>
              {content}
            </Link>
          );
        }

        return <div key={item.strokeType}>{content}</div>;
      })}
    </div>
  );
}
