"use client";

import Link from "next/link";
import type { StrokeQualityScore } from "@/types";
import { getStrokeEmoji } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface StrokeScoreCardsProps {
  scores: StrokeQualityScore[];
  sessionLinkPrefix: string;
  compact?: boolean;
}

export default function StrokeScoreCards({
  scores,
  sessionLinkPrefix,
  compact = false,
}: StrokeScoreCardsProps) {
  return (
    <div className={cn("grid gap-3", compact ? "grid-cols-3" : "grid-cols-1 sm:grid-cols-3")}>
      {scores.map((item) => {
        const hasSession = item.lastSessionId && item.qualityScore > 0;
        const content = (
          <div
            className={cn(
              "glass-card p-3 md:p-4 text-center transition-colors",
              hasSession && "glass-card-hover cursor-pointer hover:border-aqua-300/30"
            )}
          >
            <span className="text-xl md:text-2xl block mb-1">{getStrokeEmoji(item.strokeType)}</span>
            <p className="text-xs text-slate-500 truncate">{item.strokeType}</p>
            <p className="text-xl md:text-2xl font-bold text-aqua-300 mt-1">
              {hasSession ? item.qualityScore : "—"}
            </p>
          </div>
        );

        if (hasSession && item.lastSessionId) {
          return (
            <Link
              key={item.strokeType}
              href={`${sessionLinkPrefix}/${item.lastSessionId}`}
              prefetch
            >
              {content}
            </Link>
          );
        }

        return <div key={item.strokeType}>{content}</div>;
      })}
    </div>
  );
}
