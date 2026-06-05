"use client";

import QualityGauge from "@/components/session/QualityGauge";
import ProgressBar from "@/components/ui/ProgressBar";
import type { MLFeature, StrokeType } from "@/types";
import { getStrokeEmoji } from "@/lib/utils";

interface SimpleSessionAnalysisProps {
  score: number;
  features: MLFeature[];
  maxFeatures?: number;
  strokeType?: StrokeType;
}

export default function SimpleSessionAnalysis({
  score,
  features,
  maxFeatures,
  strokeType,
}: SimpleSessionAnalysisProps) {
  const displayed = maxFeatures
    ? [...features].sort((a, b) => b.value - a.value).slice(0, maxFeatures)
    : features;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      <div>
        {strokeType && (
          <p className="text-sm text-slate-400 mb-2 text-center md:text-left">
            {getStrokeEmoji(strokeType)} {strokeType}
          </p>
        )}
        <QualityGauge score={score} />
      </div>
      <div className="glass-card p-5 space-y-4">
        <h2 className="text-lg font-display font-semibold text-white">Session Breakdown</h2>
        {displayed.map((feature, index) => (
          <ProgressBar
            key={feature.name}
            value={feature.value}
            label={feature.name}
            category={feature.category}
            unit={feature.unit}
            delay={index * 0.05}
          />
        ))}
      </div>
    </div>
  );
}
