"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { Clock, ChevronRight, Activity } from "lucide-react";
import { formatDate, formatDuration, getStrokeEmoji } from "@/lib/utils";
import type { AnalysisStatus, Session } from "@/types";

const statusConfig: Record<AnalysisStatus, { label: string; dotClass: string; bgClass: string }> = {
  completed: { label: "Analyzed", dotClass: "status-dot-live", bgClass: "bg-emerald-500/10" },
  processing: { label: "Processing", dotClass: "status-dot-processing", bgClass: "bg-blue-500/10" },
  pending: { label: "Pending", dotClass: "status-dot-pending", bgClass: "bg-amber-500/10" },
  failed: { label: "Failed", dotClass: "status-dot bg-rose-500", bgClass: "bg-rose-500/10" },
};

interface SessionFeedProps {
  sessions: Session[];
}

export default function SessionFeed({ sessions }: SessionFeedProps) {
  return (
    <div className="glass-card p-5 h-full">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-display font-semibold text-white">Recent Sessions</h2>
        <span className="text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-md">
          Live Feed
        </span>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {sessions.map((session, index) => {
            const status = statusConfig[session.status];
            return (
              <motion.div
                key={session.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Link href={`/session/${session.id}`}>
                  <div className="group flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 transition-all cursor-pointer border border-transparent hover:border-white/10">
                    {/* Status Indicator */}
                    <div className={`w-10 h-10 rounded-lg ${status.bgClass} flex items-center justify-center shrink-0`}>
                      <span className={status.dotClass} />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-200 truncate">
                          {session.swimmerName}
                        </span>
                        <span className="text-xs">{getStrokeEmoji(session.strokeType)}</span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-slate-500">{formatDate(session.date)}</span>
                        <span className="text-xs text-slate-600">•</span>
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDuration(session.duration)}
                        </span>
                      </div>
                    </div>

                    {/* Score or Status */}
                    <div className="text-right shrink-0">
                      {session.qualityScore ? (
                        <div className="flex items-center gap-1">
                          <Activity className="w-3 h-3 text-aqua-300" />
                          <span className="text-sm font-bold text-aqua-300">
                            {session.qualityScore}
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-500">{status.label}</span>
                      )}
                      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-aqua-300 transition-colors ml-auto" />
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
