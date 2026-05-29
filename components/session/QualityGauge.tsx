"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";

interface QualityGaugeProps {
  score: number;
}

export default function QualityGauge({ score }: QualityGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const radius = 85;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (animatedScore / 100) * circumference;

  const getColor = (value: number) => {
    if (value >= 90) return "#10B981"; // emerald
    if (value >= 80) return "#40E0D0"; // aqua
    if (value >= 70) return "#F59E0B"; // amber
    return "#EF4444"; // rose
  };

  const getLabel = (value: number) => {
    if (value >= 90) return "Elite";
    if (value >= 80) return "Excellent";
    if (value >= 70) return "Good";
    if (value >= 60) return "Average";
    return "Needs Work";
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      const interval = setInterval(() => {
        setAnimatedScore((prev) => {
          if (prev >= score) {
            clearInterval(interval);
            return score;
          }
          return prev + 1;
        });
      }, 20);
      return () => clearInterval(interval);
    }, 300);
    return () => clearTimeout(timer);
  }, [score]);

  const color = getColor(score);
  const label = getLabel(score);

  return (
    <div className="glass-card p-6 flex flex-col items-center">
      <h2 className="text-lg font-display font-semibold text-white mb-6">Overall Quality Score</h2>

      <div className="relative w-[220px] h-[220px]">
        {/* Background glow */}
        <div 
          className="absolute inset-0 rounded-full blur-3xl opacity-20"
          style={{ backgroundColor: color }}
        />

        <svg className="w-full h-full -rotate-90" viewBox="0 0 200 200">
          {/* Background track */}
          <circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke="rgba(255,255,255,0.05)"
            strokeWidth="12"
          />

          {/* Progress arc */}
          <motion.circle
            cx="100"
            cy="100"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            style={{
              filter: `drop-shadow(0 0 8px ${color}40)`,
            }}
          />

          {/* Tick marks */}
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i * 30 * Math.PI) / 180;
            const x1 = 100 + (radius - 15) * Math.cos(angle);
            const y1 = 100 + (radius - 15) * Math.sin(angle);
            const x2 = 100 + (radius - 5) * Math.cos(angle);
            const y2 = 100 + (radius - 5) * Math.sin(angle);
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="2"
              />
            );
          })}
        </svg>

        {/* Center content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.span
            className="text-5xl font-display font-bold"
            style={{ color }}
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
          >
            {animatedScore}
          </motion.span>
          <span className="text-sm text-slate-500 mt-1">/ 100</span>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1 }}
        className="mt-4 text-center"
      >
        <span 
          className="inline-block px-4 py-1.5 rounded-full text-sm font-medium"
          style={{ 
            backgroundColor: `${color}20`,
            color,
            border: `1px solid ${color}40`
          }}
        >
          {label}
        </span>
      </motion.div>
    </div>
  );
}
