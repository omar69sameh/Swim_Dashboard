"use client";

import { cn } from "@/lib/utils";

interface StrokeIconProps {
  stroke: string;
  size?: number;
  className?: string;
  animated?: boolean;
}

const STROKE_COLORS: Record<string, string> = {
  Freestyle:    "text-cyan-400",
  Butterfly:    "text-violet-400",
  Breaststroke: "text-emerald-400",
  Backstroke:   "text-amber-400",
  IM:           "text-rose-400",
};

const STROKE_GLOW: Record<string, string> = {
  Freestyle:    "drop-shadow(0 0 6px rgba(34,211,238,0.7))",
  Butterfly:    "drop-shadow(0 0 6px rgba(167,139,250,0.7))",
  Breaststroke: "drop-shadow(0 0 6px rgba(52,211,153,0.7))",
  Backstroke:   "drop-shadow(0 0 6px rgba(251,191,36,0.7))",
  IM:           "drop-shadow(0 0 6px rgba(251,113,133,0.7))",
};

export default function StrokeIcon({ stroke, size = 28, className, animated = false }: StrokeIconProps) {
  const s = size;
  const color = STROKE_COLORS[stroke] ?? "text-aqua-300";
  const glow  = STROKE_GLOW[stroke]  ?? "drop-shadow(0 0 6px rgba(64,224,208,0.7))";

  const svgClass = cn(
    color,
    "transition-all duration-300",
    animated && "group-hover:scale-110",
    className
  );
  const glowStyle = { filter: glow };

  const icons: Record<string, React.ReactNode> = {
    Freestyle: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={svgClass} style={animated ? glowStyle : undefined}>
        <ellipse cx="14" cy="15" rx="8" ry="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M22 13 Q25 11 26 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 16 Q3 18 2 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 14 Q3 12 2 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="22" cy="11" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    Butterfly: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={svgClass} style={animated ? glowStyle : undefined}>
        <path d="M14 16 Q9 8 4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 16 Q19 8 24 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M11 18 Q14 23 17 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M12 15 L16 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="14" cy="12" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    Breaststroke: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={svgClass} style={animated ? glowStyle : undefined}>
        <path d="M14 13 Q9 11 4 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 13 Q19 11 24 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M11 17 Q9 21 7 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M17 17 Q19 21 21 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <ellipse cx="14" cy="15" rx="3" ry="2" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="14" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    Backstroke: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={svgClass} style={animated ? glowStyle : undefined}>
        <ellipse cx="14" cy="16" rx="8" ry="3" stroke="currentColor" strokeWidth="1.8" />
        <path d="M22 14 Q25 10 24 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 17 Q3 19 2 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M6 15 Q3 13 2 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="22" cy="13" r="2.2" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
    IM: (
      <svg width={s} height={s} viewBox="0 0 28 28" fill="none" className={svgClass} style={animated ? glowStyle : undefined}>
        <path d="M14 4 L14 10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M14 18 L14 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M4 14 L10 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M18 14 L24 14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="14" cy="14" r="4" stroke="currentColor" strokeWidth="1.8" />
      </svg>
    ),
  };

  return <>{icons[stroke] ?? icons["Freestyle"]}</>;
}
