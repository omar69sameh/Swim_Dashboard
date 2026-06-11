"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Trophy } from "lucide-react";
import type { PersonalBest } from "@/lib/stroke-scores";
import { qualityTierDisplay, formatDate } from "@/lib/utils";
import StrokeIcon from "@/components/ui/StrokeIcon";

interface PersonalBestSectionProps {
  pbs: PersonalBest[];
  sessionLinkPrefix: string;
}

const STROKE_ACCENT: Record<string, string> = {
  Freestyle:    "border-cyan-400/25    bg-cyan-400/5",
  Butterfly:    "border-violet-400/25  bg-violet-400/5",
  Breaststroke: "border-emerald-400/25 bg-emerald-400/5",
  Backstroke:   "border-amber-400/25   bg-amber-400/5",
  IM:           "border-rose-400/25    bg-rose-400/5",
};

const SCORE_COLOR = (score: number) =>
  score >= 75 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-rose-400";

export default function PersonalBestSection({ pbs, sessionLinkPrefix }: PersonalBestSectionProps) {
  if (pbs.length === 0) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-slate-300">Personal Bests</h2>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {pbs.map((pb, i) => {
          const t = qualityTierDisplay(pb.qualityTier, pb.qualityLabel);
          const accent = STROKE_ACCENT[pb.strokeType] ?? "border-white/10 bg-white/5";
          const scoreColor = SCORE_COLOR(pb.qualityScore);

          return (
            <motion.div
              key={pb.strokeType}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                href={`${sessionLinkPrefix}/${pb.sessionId}`}
                prefetch
                className={`block glass-card border p-4 rounded-xl hover:brightness-110 transition-all ${accent}`}
              >
                {/* Header */}
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <StrokeIcon stroke={pb.strokeType} size={18} />
                    <span className="text-sm font-medium text-slate-200">{pb.strokeType}</span>
                  </div>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/30 text-amber-300">
                    PB
                  </span>
                </div>

                {/* Score */}
                <div className="flex items-end gap-2 mb-2">
                  <span className={`text-3xl font-display font-bold leading-none ${scoreColor}`}>
                    {pb.qualityScore}
                  </span>
                  <span className="text-xs text-slate-500 mb-0.5">/ 100</span>
                </div>

                {/* Risk tier badge */}
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full border ${t.bg} ${t.color} mb-3`}>
                  {t.text}
                </span>

                {/* Meta */}
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{formatDate(pb.date)}</span>
                  {pb.numStrokes != null && <span>{pb.numStrokes} strokes</span>}
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
