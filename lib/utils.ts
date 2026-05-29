import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function getStrokeEmoji(stroke: string): string {
  const map: Record<string, string> = {
    Butterfly: "🦋",
    Freestyle: "🏊",
    Backstroke: "🔙",
    Breaststroke: "🐸",
    IM: "🔄",
  };
  return map[stroke] || "🏊";
}

export function getCategoryColor(category: string): string {
  const map: Record<string, string> = {
    good: "text-emerald-400",
    average: "text-amber-400",
    needs_improvement: "text-rose-400",
  };
  return map[category] || "text-slate-400";
}

export function getCategoryBg(category: string): string {
  const map: Record<string, string> = {
    good: "bg-emerald-400/10",
    average: "bg-amber-400/10",
    needs_improvement: "bg-rose-400/10",
  };
  return map[category] || "bg-slate-400/10";
}
