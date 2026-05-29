"use client";

import { motion } from "framer-motion";
import { Users, TrendingUp, Zap, Activity, ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import Sidebar from "@/components/layout/Sidebar";
import TopBar from "@/components/layout/TopBar";
import MetricCard from "@/components/dashboard/MetricCard";
import SessionFeed from "@/components/dashboard/SessionFeed";
import SwimmerGrid from "@/components/dashboard/SwimmerGrid";
import { teamMetrics } from "@/lib/data";

const iconMap = {
  Users,
  TrendingUp,
  Zap,
  Activity,
};

export default function DashboardPage() {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      <div className="flex-1 ml-[72px] transition-all duration-300">
        <TopBar />

        <main className="p-6 space-y-6">
          {/* Page Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="text-3xl font-display font-bold text-white mb-1">
              Coach Dashboard
            </h1>
            <p className="text-slate-400">
              Real-time insights from your team&apos;s ML-powered stroke analysis
            </p>
          </motion.div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {teamMetrics.map((metric, index) => {
              const Icon = iconMap[metric.icon as keyof typeof iconMap] || Activity;
              const TrendIcon = metric.trend === "up" ? ArrowUpRight : metric.trend === "down" ? ArrowDownRight : Minus;
              const trendColor = metric.trend === "up" ? "text-emerald-400" : metric.trend === "down" ? "text-rose-400" : "text-slate-400";

              return (
                <motion.div
                  key={metric.label}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <MetricCard
                    label={metric.label}
                    value={metric.value}
                    icon={<Icon className="w-5 h-5" />}
                    trend={
                      <span className={`flex items-center gap-1 text-xs font-medium ${trendColor}`}>
                        <TrendIcon className="w-3 h-3" />
                        {metric.change > 0 ? "+" : ""}{metric.change}%
                      </span>
                    }
                  />
                </motion.div>
              );
            })}
          </div>

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Swimmer Grid - Takes 2 columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="lg:col-span-2"
            >
              <SwimmerGrid />
            </motion.div>

            {/* Session Feed - Takes 1 column */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <SessionFeed />
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
