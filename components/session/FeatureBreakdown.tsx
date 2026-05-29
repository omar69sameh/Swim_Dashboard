"use client";

import { motion } from "framer-motion";
import { BarChart3 } from "lucide-react";
import { MLFeature } from "@/types";
import ProgressBar from "@/components/ui/ProgressBar";

interface FeatureBreakdownProps {
  features: MLFeature[];
}

export default function FeatureBreakdown({ features }: FeatureBreakdownProps) {
  return (
    <div className="glass-card p-5 h-full">
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-aqua-300" />
        <h2 className="text-lg font-display font-semibold text-white">Feature Breakdown</h2>
      </div>

      <div className="space-y-5">
        {features.map((feature, index) => (
          <motion.div
            key={feature.name}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <ProgressBar
              value={feature.value}
              label={feature.name}
              category={feature.category}
              unit={feature.unit}
              delay={index * 0.15}
            />
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-white/5 flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span className="text-xs text-slate-400">Good (85+)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="text-xs text-slate-400">Average (75-84)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-400" />
          <span className="text-xs text-slate-400">Needs Work (&lt;75)</span>
        </div>
      </div>
    </div>
  );
}
