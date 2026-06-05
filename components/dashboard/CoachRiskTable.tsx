"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Session, Swimmer } from "@/types";
import { TRACKED_STROKES } from "@/lib/stroke-scores";
import { qualityTierDisplay } from "@/lib/utils";

interface CoachRiskTableProps {
  swimmers: Swimmer[];
  sessions: Session[];
}

/** For each swimmer+stroke, return the latest completed session with a quality tier. */
function getLatestByStroke(
  swimmerId: string,
  strokeType: string,
  sessions: Session[]
): Session | null {
  return (
    sessions
      .filter(
        (s) =>
          s.swimmerId === swimmerId &&
          s.strokeType === strokeType &&
          s.status === "completed" &&
          s.qualityScore != null
      )
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] ?? null
  );
}

function RiskCell({ session }: { session: Session | null }) {
  if (!session) {
    return (
      <div className="rounded-lg px-2 py-2 text-center bg-white/5 border border-white/5">
        <span className="text-[10px] text-slate-600">—</span>
      </div>
    );
  }

  const t = qualityTierDisplay(session.qualityTier, session.qualityLabel);

  return (
    <Link
      href={`/coach/session/${session.id}`}
      title={`View session — ${t.text}`}
      className={`block rounded-lg px-2 py-2 text-center border hover:brightness-110 transition-all ${t.bg}`}
    >
      <p className={`text-[10px] font-semibold leading-tight ${t.color}`}>{t.text}</p>
      {session.qualityScore != null && (
        <p className={`text-[9px] mt-0.5 opacity-70 ${t.color}`}>{session.qualityScore}</p>
      )}
    </Link>
  );
}

export default function CoachRiskTable({ swimmers, sessions }: CoachRiskTableProps) {
  if (swimmers.length === 0) return null;

  return (
    <div className="glass-card p-4">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-300">Team Risk Overview</h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Latest session quality per swimmer — tap a cell to open that session
        </p>
      </div>

      {/* Scrollable so it works on mobile */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px]">
          <thead>
            <tr>
              <th className="text-left text-xs text-slate-500 font-medium pb-3 pr-4 w-32">
                Swimmer
              </th>
              {TRACKED_STROKES.map((stroke) => (
                <th key={stroke} className="text-center text-xs text-slate-500 font-medium pb-3 px-1">
                  {stroke}
                </th>
              ))}
              <th className="text-center text-xs text-slate-500 font-medium pb-3 pl-2">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="space-y-2">
            {swimmers.map((swimmer, i) => {
              const totalSessions = sessions.filter(
                (s) => s.swimmerId === swimmer.id && s.status === "completed"
              ).length;

              return (
                <motion.tr
                  key={swimmer.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: i * 0.05 }}
                  className="border-t border-white/5"
                >
                  {/* Swimmer name */}
                  <td className="py-2 pr-4">
                    <Link
                      href={`/coach/swimmer/${swimmer.id}`}
                      className="text-sm text-slate-200 hover:text-aqua-300 transition-colors font-medium truncate block max-w-[120px]"
                    >
                      {swimmer.name}
                    </Link>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      avg {swimmer.averageQualityScore}
                    </p>
                  </td>

                  {/* One cell per stroke */}
                  {TRACKED_STROKES.map((stroke) => {
                    const session = getLatestByStroke(swimmer.id, stroke, sessions);
                    return (
                      <td key={stroke} className="py-2 px-1">
                        <RiskCell session={session} />
                      </td>
                    );
                  })}

                  {/* Total sessions */}
                  <td className="py-2 pl-2 text-center">
                    <span className="text-sm font-bold text-slate-300">{totalSessions}</span>
                    <p className="text-[9px] text-slate-600">sessions</p>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-4 pt-3 border-t border-white/5">
        {[
          { label: "Good Form", color: "text-emerald-400", bg: "bg-emerald-400/10" },
          { label: "Moderate", color: "text-amber-400", bg: "bg-amber-400/10" },
          { label: "Needs Attention", color: "text-orange-400", bg: "bg-orange-400/10" },
          { label: "Needs Work", color: "text-rose-400", bg: "bg-rose-400/10" },
        ].map(({ label, color, bg }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${bg} border border-current ${color}`} />
            <span className={`text-[10px] ${color}`}>{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-white/5 border border-white/10" />
          <span className="text-[10px] text-slate-600">No data</span>
        </div>
      </div>
    </div>
  );
}
