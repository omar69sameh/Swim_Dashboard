"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowUpRight, TrendingUp, TrendingDown, Minus } from "lucide-react";
import type { Swimmer } from "@/types";
import { getStrokeEmoji } from "@/lib/utils";

interface SwimmerGridProps {
  swimmers: Swimmer[];
}

export default function SwimmerGrid({ swimmers }: SwimmerGridProps) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-5">
        <h2 className="text-lg font-display font-semibold text-white">Team Roster</h2>
        <button className="text-xs text-aqua-300 hover:text-aqua-200 transition-colors">
          View All
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {swimmers.map((swimmer, index) => {
          const trend = swimmer.averageQualityScore > 85 ? "up" : swimmer.averageQualityScore < 80 ? "down" : "neutral";
          const TrendIcon = trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus;
          const trendColor = trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-slate-400";

          return (
            <motion.div
              key={swimmer.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: index * 0.08 }}
              whileHover={{ scale: 1.02 }}
            >
              <Link href={`/swimmer/${swimmer.id}`}>
                <div className="glass-card-hover p-4 cursor-pointer group">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-ocean-700 to-ocean-600 border border-white/10 flex items-center justify-center text-lg font-bold text-white">
                        {swimmer.name.split(" ").map(n => n[0]).join("")}
                      </div>

                      <div>
                        <h3 className="font-medium text-slate-200 group-hover:text-white transition-colors">
                          {swimmer.name}
                        </h3>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-sm">{getStrokeEmoji(swimmer.strokeSpecialty)}</span>
                          <span className="text-xs text-slate-500">{swimmer.strokeSpecialty}</span>
                          <span className="text-xs text-slate-600">•</span>
                          <span className="text-xs text-slate-500">{swimmer.age} yrs</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-right">
                      <div className={`flex items-center gap-1 ${trendColor}`}>
                        <TrendIcon className="w-3 h-3" />
                        <span className="text-sm font-bold">{swimmer.averageQualityScore}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">Avg Score</p>
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-xs text-slate-500">Sessions</p>
                        <p className="text-sm font-medium text-slate-300">{swimmer.totalSessions}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-500">Last Active</p>
                        <p className="text-sm font-medium text-slate-300">{swimmer.lastSessionDate}</p>
                      </div>
                    </div>
                    <ArrowUpRight className="w-4 h-4 text-slate-600 group-hover:text-aqua-300 transition-colors" />
                  </div>
                </div>
              </Link>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
