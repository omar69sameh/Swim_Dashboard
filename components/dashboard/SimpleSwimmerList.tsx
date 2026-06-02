"use client";

import Link from "next/link";
import type { Session, Swimmer } from "@/types";
import { getStrokeEmoji } from "@/lib/utils";
import { getStrokeScoresForSwimmer } from "@/lib/stroke-scores";

interface SimpleSwimmerListProps {
  swimmers: Swimmer[];
  sessions: Session[];
  basePath?: string;
}

export default function SimpleSwimmerList({
  swimmers,
  sessions,
  basePath = "/coach/swimmer",
}: SimpleSwimmerListProps) {
  return (
    <ul className="space-y-2">
      {swimmers.map((swimmer) => {
        const strokeScores = getStrokeScoresForSwimmer(swimmer.id, sessions);

        return (
          <li key={swimmer.id}>
            <Link
              href={`${basePath}/${swimmer.id}`}
              prefetch
              className="block p-4 rounded-lg glass-card-hover border border-transparent hover:border-white/10"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xl shrink-0">{getStrokeEmoji(swimmer.strokeSpecialty)}</span>
                <p className="font-medium text-slate-200 truncate">{swimmer.name}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {strokeScores.map((s) => (
                  <div key={s.strokeType} className="rounded-md bg-white/5 px-1 py-2">
                    <p className="text-[10px] text-slate-500 truncate">{s.strokeType}</p>
                    <p className="text-sm font-bold text-aqua-300">
                      {s.qualityScore > 0 ? s.qualityScore : "—"}
                    </p>
                    {s.numStrokes != null && s.qualityScore > 0 && (
                      <p className="text-[9px] text-slate-600 mt-0.5">{s.numStrokes} strokes</p>
                    )}
                  </div>
                ))}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
