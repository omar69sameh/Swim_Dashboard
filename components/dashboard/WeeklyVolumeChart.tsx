"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from "recharts";
import type { Session } from "@/types";
import { TRACKED_STROKES } from "@/lib/stroke-scores";

interface WeeklyVolumeChartProps {
  sessions: Session[];
  swimmerId?: string; // filter to one swimmer; omit for all
}

const STROKE_COLOR: Record<string, string> = {
  Freestyle:    "#22d3ee", // cyan-400
  Breaststroke: "#34d399", // emerald-400
  Butterfly:    "#a78bfa", // violet-400
  Backstroke:   "#fbbf24", // amber-400
  IM:           "#fb7185", // rose-400
};

/** Returns the Monday of the week that contains `date`. */
function getMondayOf(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
}

function buildWeeklyData(sessions: Session[], swimmerId?: string) {
  // Generate last 8 Mondays (oldest first)
  const now = new Date();
  const thisMonday = getMondayOf(now);

  const weeks = Array.from({ length: 8 }, (_, i) => {
    const monday = new Date(thisMonday);
    monday.setDate(thisMonday.getDate() - (7 - i) * 7);
    return monday;
  });

  const filtered = sessions.filter(
    (s) =>
      s.status === "completed" &&
      (!swimmerId || s.swimmerId === swimmerId)
  );

  return weeks.map((monday) => {
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const label = monday.toLocaleString("en-US", { month: "short", day: "numeric" });

    const week = filtered.filter((s) => {
      const d = new Date(s.date);
      return d >= monday && d <= sunday;
    });

    const row: Record<string, number | string> = { week: label, total: week.length };
    for (const stroke of TRACKED_STROKES) {
      row[stroke] = week.filter((s) => s.strokeType === stroke).length;
    }
    return row;
  });
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  const total = (payload as any[]).reduce((s: number, p: any) => s + (p.value || 0), 0);
  return (
    <div className="rounded-xl border border-white/10 bg-ocean-950/95 p-3 text-xs shadow-xl">
      <p className="text-slate-400 mb-2 font-medium">Week of {label}</p>
      {(payload as any[])
        .filter((p) => p.value > 0)
        .map((p) => (
          <p key={p.dataKey} className="flex justify-between gap-4" style={{ color: p.fill }}>
            <span>{p.dataKey}</span>
            <span className="font-bold">{p.value}</span>
          </p>
        ))}
      <p className="text-slate-400 mt-2 pt-2 border-t border-white/10 flex justify-between">
        <span>Total</span><span className="font-bold text-white">{total}</span>
      </p>
    </div>
  );
};

export default function WeeklyVolumeChart({ sessions, swimmerId }: WeeklyVolumeChartProps) {
  const data = buildWeeklyData(sessions, swimmerId);
  const hasData = data.some((row) => (row.total as number) > 0);

  if (!hasData) {
    return (
      <div className="glass-card p-5">
        <h2 className="text-lg font-display font-semibold text-white mb-1">Weekly Training Volume</h2>
        <p className="text-sm text-slate-500">No sessions recorded in the last 8 weeks.</p>
      </div>
    );
  }

  // Compute max value for Y-axis (next integer above max total)
  const maxTotal = Math.max(...data.map((r) => r.total as number));

  return (
    <div className="glass-card p-5">
      <div className="mb-4">
        <h2 className="text-lg font-display font-semibold text-white">Weekly Training Volume</h2>
        <p className="text-sm text-slate-500">Sessions per week — last 8 weeks</p>
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="week"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              tickLine={false}
            />
            <YAxis
              allowDecimals={false}
              domain={[0, Math.max(maxTotal + 1, 4)]}
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
            <Legend
              formatter={(value) => (
                <span style={{ color: "#94a3b8", fontSize: 11 }}>{value}</span>
              )}
            />
            {TRACKED_STROKES.map((stroke) => (
              <Bar
                key={stroke}
                dataKey={stroke}
                stackId="sessions"
                fill={STROKE_COLOR[stroke]}
                radius={stroke === TRACKED_STROKES[TRACKED_STROKES.length - 1] ? [3, 3, 0, 0] : [0, 0, 0, 0]}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
