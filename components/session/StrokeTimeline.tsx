"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { ZoomIn, ZoomOut, MoveHorizontal, Activity } from "lucide-react";
import { SensorData, StrokeSegment } from "@/types";

interface StrokeTimelineProps {
  sensorData: SensorData[];
  segments: StrokeSegment[];
}

export default function StrokeTimeline({ sensorData, segments }: StrokeTimelineProps) {
  const [zoomRange, setZoomRange] = useState<[number, number] | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<number | null>(null);
  const [selectedAxis, setSelectedAxis] = useState<"accelerometer" | "gyroscope">("accelerometer");

  // Downsample data for performance (show every 5th point)
  const downsampled = sensorData.filter((_, i) => i % 5 === 0);

  const handleZoomIn = useCallback(() => {
    if (!zoomRange) {
      const mid = downsampled.length / 2;
      setZoomRange([mid - mid / 4, mid + mid / 4]);
    } else {
      const [start, end] = zoomRange;
      const range = end - start;
      setZoomRange([start + range * 0.1, end - range * 0.1]);
    }
  }, [zoomRange, downsampled.length]);

  const handleZoomOut = useCallback(() => {
    if (!zoomRange) return;
    const [start, end] = zoomRange;
    const range = end - start;
    const newStart = Math.max(0, start - range * 0.2);
    const newEnd = Math.min(downsampled.length - 1, end + range * 0.2);
    if (newEnd - newStart >= downsampled.length - 10) {
      setZoomRange(null);
    } else {
      setZoomRange([newStart, newEnd]);
    }
  }, [zoomRange, downsampled.length]);

  const handleReset = useCallback(() => {
    setZoomRange(null);
  }, []);

  const dataDomain = zoomRange
    ? [downsampled[Math.floor(zoomRange[0])]?.timestamp, downsampled[Math.floor(zoomRange[1])]?.timestamp]
    : ["dataMin", "dataMax"];

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="glass-panel p-3 rounded-lg border border-aqua-300/20 min-w-[180px]">
          <p className="text-xs text-slate-400 mb-2">Time: {label?.toFixed(2)}s</p>
          {payload.map((entry: any, idx: number) => (
            <div key={idx} className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
              <span className="text-xs text-slate-300">{entry.name}:</span>
              <span className="text-xs font-bold text-white">{entry.value?.toFixed(3)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="glass-card p-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-aqua-300" />
          <h2 className="text-lg font-display font-semibold text-white">Stroke Timeline</h2>
          <span className="text-xs text-slate-500 bg-white/5 px-2 py-0.5 rounded-md ml-2">
            {segments.length} strokes detected
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Axis Toggle */}
          <div className="flex bg-ocean-900/50 rounded-lg p-0.5 border border-white/10">
            <button
              onClick={() => setSelectedAxis("accelerometer")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedAxis === "accelerometer"
                  ? "bg-aqua-300/20 text-aqua-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Accelerometer
            </button>
            <button
              onClick={() => setSelectedAxis("gyroscope")}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                selectedAxis === "gyroscope"
                  ? "bg-aqua-300/20 text-aqua-300"
                  : "text-slate-400 hover:text-slate-300"
              }`}
            >
              Gyroscope
            </button>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleZoomIn}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleReset}
              className="p-1.5 rounded-lg hover:bg-white/5 text-slate-400 transition-colors"
              title="Reset View"
            >
              <MoveHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-[400px] relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={downsampled} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis
              dataKey="timestamp"
              type="number"
              domain={dataDomain}
              tickFormatter={(v) => `${v.toFixed(1)}s`}
              stroke="rgba(148, 163, 184, 0.3)"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              label={{ value: "Time (seconds)", position: "insideBottom", offset: -5, fill: "#64748b", fontSize: 12 }}
            />
            <YAxis
              stroke="rgba(148, 163, 184, 0.3)"
              tick={{ fill: "#94a3b8", fontSize: 11 }}
              axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
              domain={["auto", "auto"]}
            />
            <Tooltip content={<CustomTooltip />} />

            {/* Segment overlays */}
            {segments.slice(0, 20).map((segment, idx) => {
              const startTime = sensorData[segment.startIndex]?.timestamp;
              const endTime = sensorData[segment.endIndex]?.timestamp;
              if (startTime === undefined || endTime === undefined) return null;

              const isHovered = hoveredSegment === idx;

              return (
                <ReferenceArea
                  key={idx}
                  x1={startTime}
                  x2={endTime}
                  fill={isHovered ? "rgba(64, 224, 208, 0.15)" : "rgba(64, 224, 208, 0.05)"}
                  stroke={isHovered ? "rgba(64, 224, 208, 0.5)" : "rgba(64, 224, 208, 0.2)"}
                  strokeWidth={isHovered ? 2 : 1}
                  onMouseEnter={() => setHoveredSegment(idx)}
                  onMouseLeave={() => setHoveredSegment(null)}
                />
              );
            })}

            {/* Segment boundary markers */}
            {segments.slice(0, 20).map((segment, idx) => {
              const startTime = sensorData[segment.startIndex]?.timestamp;
              if (startTime === undefined) return null;
              return (
                <ReferenceLine
                  key={`start-${idx}`}
                  x={startTime}
                  stroke="rgba(64, 224, 208, 0.3)"
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              );
            })}

            {selectedAxis === "accelerometer" ? (
              <>
                <Line
                  type="monotone"
                  dataKey="accelerometerX"
                  stroke="#40E0D0"
                  strokeWidth={1.5}
                  dot={false}
                  name="Acc X"
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="accelerometerY"
                  stroke="#00BFFF"
                  strokeWidth={1.5}
                  dot={false}
                  name="Acc Y"
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="accelerometerZ"
                  stroke="#7FFFD4"
                  strokeWidth={1.5}
                  dot={false}
                  name="Acc Z"
                  animationDuration={1000}
                />
              </>
            ) : (
              <>
                <Line
                  type="monotone"
                  dataKey="gyroscopeX"
                  stroke="#F59E0B"
                  strokeWidth={1.5}
                  dot={false}
                  name="Gyro X"
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="gyroscopeY"
                  stroke="#EF4444"
                  strokeWidth={1.5}
                  dot={false}
                  name="Gyro Y"
                  animationDuration={1000}
                />
                <Line
                  type="monotone"
                  dataKey="gyroscopeZ"
                  stroke="#8B5CF6"
                  strokeWidth={1.5}
                  dot={false}
                  name="Gyro Z"
                  animationDuration={1000}
                />
              </>
            )}
          </LineChart>
        </ResponsiveContainer>

        {/* Hover info overlay */}
        <AnimatePresence>
          {hoveredSegment !== null && segments[hoveredSegment] && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="absolute top-4 right-4 glass-panel p-3 rounded-lg border border-aqua-300/20"
            >
              <p className="text-xs text-slate-400">Stroke #{hoveredSegment + 1}</p>
              <p className="text-sm font-bold text-aqua-300">
                {segments[hoveredSegment].strokeType}
              </p>
              <p className="text-xs text-slate-500">
                Confidence: {segments[hoveredSegment].confidence.toFixed(1)}%
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-6">
        {selectedAxis === "accelerometer" ? (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#40E0D0]" />
              <span className="text-xs text-slate-400">Acc X</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#00BFFF]" />
              <span className="text-xs text-slate-400">Acc Y</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#7FFFD4]" />
              <span className="text-xs text-slate-400">Acc Z</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#F59E0B]" />
              <span className="text-xs text-slate-400">Gyro X</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#EF4444]" />
              <span className="text-xs text-slate-400">Gyro Y</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-0.5 bg-[#8B5CF6]" />
              <span className="text-xs text-slate-400">Gyro Z</span>
            </div>
          </>
        )}
        <div className="flex items-center gap-1.5 ml-4">
          <span className="w-3 h-3 bg-aqua-300/10 border border-aqua-300/20" />
          <span className="text-xs text-slate-400">ML Segment</span>
        </div>
      </div>
    </div>
  );
}
