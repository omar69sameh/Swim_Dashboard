"use client";

import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Clock, Ruler, Waves } from "lucide-react";
import Link from "next/link";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import SessionHeader from "@/components/session/SessionHeader";
import StrokeTimeline from "@/components/session/StrokeTimeline";
import QualityGauge from "@/components/session/QualityGauge";
import FeatureBreakdown from "@/components/session/FeatureBreakdown";
import { sessions, generateMLResults } from "@/lib/data";

export default function SessionAnalysisPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const session = sessions.find((s) => s.id === sessionId);

  if (!session) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-2">Session Not Found</h1>
          <Link href="/" className="text-aqua-300 hover:text-aqua-200">Return to Dashboard</Link>
        </div>
      </div>
    );
  }

  const mlResults = generateMLResults(sessionId);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex-1 ml-[72px]">
        <TopBar />
        <main className="p-6 space-y-6">
          {/* Back Link */}
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-aqua-300 transition-colors">
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Link>
          </motion.div>

          {/* Session Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <SessionHeader session={session} mlResults={mlResults} />
          </motion.div>

          {/* Main Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Quality Gauge - 4 columns */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-4"
            >
              <QualityGauge score={mlResults.overallQualityScore} />
            </motion.div>

            {/* Feature Breakdown - 8 columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="lg:col-span-8"
            >
              <FeatureBreakdown features={mlResults.features} />
            </motion.div>
          </div>

          {/* Stroke Timeline - Full width */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <StrokeTimeline sensorData={mlResults.sensorData} segments={mlResults.segments} />
          </motion.div>

          {/* Session Metadata */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card p-5"
          >
            <h3 className="text-sm font-semibold text-slate-300 mb-3">Session Metadata</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-500 mb-1">Duration</p>
                <p className="text-sm font-medium text-slate-200 flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-aqua-300" />
                  {Math.floor(session.duration / 60)}m {session.duration % 60}s
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-500 mb-1">Distance</p>
                <p className="text-sm font-medium text-slate-200 flex items-center gap-1">
                  <Ruler className="w-3.5 h-3.5 text-aqua-300" />
                  {session.distance}m
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-500 mb-1">Pool Length</p>
                <p className="text-sm font-medium text-slate-200 flex items-center gap-1">
                  <Waves className="w-3.5 h-3.5 text-aqua-300" />
                  {session.poolLength}m
                </p>
              </div>
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-slate-500 mb-1">ML Pipeline</p>
                <p className="text-sm font-medium text-slate-200">{mlResults.pipelineVersion}</p>
              </div>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
