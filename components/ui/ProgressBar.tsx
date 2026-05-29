"use client";

import { motion } from "framer-motion";
import { cn, getCategoryColor, getCategoryBg } from "@/lib/utils";

interface ProgressBarProps {
  value: number;
  max?: number;
  label: string;
  category: "good" | "average" | "needs_improvement";
  unit?: string;
  delay?: number;
}

export default function ProgressBar({ value, max = 100, label, category, unit, delay = 0 }: ProgressBarProps) {
  const percentage = (value / max) * 100;
  const colorClass = getCategoryColor(category);
  const bgClass = getCategoryBg(category);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-300">{label}</span>
        <div className="flex items-center gap-2">
          <span className={cn("text-xs px-2 py-0.5 rounded-full font-medium", bgClass, colorClass)}>
            {category.replace("_", " ")}
          </span>
          <span className="text-sm font-bold text-white">
            {value}{unit ? <span className="text-xs text-slate-500 ml-0.5">{unit}</span> : null}
          </span>
        </div>
      </div>
      <div className="h-2.5 bg-ocean-900/80 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1.2, delay, ease: "easeOut" }}
          className={cn("h-full rounded-full", 
            category === "good" ? "bg-gradient-to-r from-emerald-500 to-emerald-400" :
            category === "average" ? "bg-gradient-to-r from-amber-500 to-amber-400" :
            "bg-gradient-to-r from-rose-500 to-rose-400"
          )}
        />
      </div>
    </div>
  );
}
