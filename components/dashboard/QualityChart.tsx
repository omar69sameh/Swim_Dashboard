"use client";

import { motion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { generateHistoricalData } from "@/lib/data";

interface QualityChartProps {
  swimmerId: string;
}

export default function QualityChart({ swimmerId }: QualityChartProps) {
  const data = generateHistoricalData(swimmerId);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-panel p-3 rounded-lg border border-aqua-300/20">
          <p className="text-xs text-slate-400 mb-1">{label}</p>
          <p className="text-lg font-bold text-aqua-300">
            {payload[0].value}
            <span className="text-xs text-slate-500 ml-1">/100</span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-display font-semibold text-white">Quality Score Trend</h2>
          <p className="text-sm text-slate-500">Performance over the last 30 days</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-aqua-300/50" />
          <span className="text-xs text-slate-400">Quality Score</span>
        </div>
      </div>

      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="qualityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#40E0D0" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#40E0D0" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const date = new Date(value);
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }}
              stroke="rgba(148, 163, 184, 0.3)"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            />
            <YAxis
              domain={[60, 100]}
              stroke="rgba(148, 163, 184, 0.3)"
              tick={{ fill: "#94a3b8", fontSize: 12 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={85} stroke="rgba(16, 185, 129, 0.3)" strokeDasharray="5 5" label={{ value: "Target", fill: "#10b981", fontSize: 12, position: "right" }} />
            <Area
              type="monotone"
              dataKey="qualityScore"
              stroke="#40E0D0"
              strokeWidth={2}
              fill="url(#qualityGradient)"
              animationDuration={1500}
              dot={{ fill: "#40E0D0", strokeWidth: 2, r: 3, stroke: "#0B1120" }}
              activeDot={{ r: 5, fill: "#40E0D0", stroke: "#fff", strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
