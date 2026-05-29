"use client";

import { motion } from "framer-motion";
import { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string | number;
  icon: ReactNode;
  trend: ReactNode;
}

export default function MetricCard({ label, value, icon, trend }: MetricCardProps) {
  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ duration: 0.2 }}
      className="glass-card-hover p-5"
    >
      <div className="flex items-start justify-between mb-3">
        <div className="p-2 rounded-lg bg-aqua-300/10 text-aqua-300">
          {icon}
        </div>
        {trend}
      </div>
      <div>
        <p className="text-2xl font-display font-bold text-white">{value}</p>
        <p className="text-sm text-slate-500 mt-1">{label}</p>
      </div>
    </motion.div>
  );
}
