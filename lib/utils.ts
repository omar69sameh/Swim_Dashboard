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

export function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const date = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${date} at ${time}`;
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

/** Maps a quality_tier value from the DB to a swimmer-friendly display object.
 *  Tier always takes priority over label. */
export function qualityTierDisplay(
  tier: string | undefined,
  label: string | undefined
): { text: string; color: string; bg: string } {
  const t = (tier ?? "").toLowerCase().replace(/-/g, "_");

  if (t === "low" || t === "good") {
    return { text: "Low Risk", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" };
  }
  if (t === "moderate") {
    return { text: "Moderate Risk", color: "text-amber-400", bg: "bg-amber-400/10 border-amber-400/20" };
  }
  if (t === "moderate_high") {
    return { text: "Moderate-High Risk", color: "text-orange-400", bg: "bg-orange-400/10 border-orange-400/20" };
  }
  if (t === "high" || t === "bad" || t === "risk") {
    return { text: "High Risk", color: "text-rose-400", bg: "bg-rose-400/10 border-rose-400/20" };
  }
  // Fallback: use label if tier is missing
  if (label?.toLowerCase() === "good") {
    return { text: "Low Risk", color: "text-emerald-400", bg: "bg-emerald-400/10 border-emerald-400/20" };
  }
  if (label?.toLowerCase() === "bad") {
    return { text: "High Risk", color: "text-rose-400", bg: "bg-rose-400/10 border-rose-400/20" };
  }
  return { text: "Unknown", color: "text-slate-400", bg: "bg-slate-400/10 border-slate-400/20" };
}

export function getCategoryBg(category: string): string {
  const map: Record<string, string> = {
    good: "bg-emerald-400/10",
    average: "bg-amber-400/10",
    needs_improvement: "bg-rose-400/10",
  };
  return map[category] || "bg-slate-400/10";
}
