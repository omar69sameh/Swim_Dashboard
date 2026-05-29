"use client";

import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger" | "info" | "aqua";
  className?: string;
}

export default function Badge({ children, variant = "default", className }: BadgeProps) {
  const variants = {
    default: "bg-white/10 text-slate-300 border-white/10",
    success: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    warning: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    danger: "bg-rose-500/15 text-rose-400 border-rose-500/20",
    info: "bg-blue-500/15 text-blue-400 border-blue-500/20",
    aqua: "bg-aqua-300/15 text-aqua-300 border-aqua-300/20",
  };

  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium border",
      variants[variant],
      className
    )}>
      {children}
    </span>
  );
}
