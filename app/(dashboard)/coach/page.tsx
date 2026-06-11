"use client";

import Link from "next/link";
import { GitCompare } from "lucide-react";
import SimpleSwimmerList from "@/components/dashboard/SimpleSwimmerList";
import CoachRiskTable from "@/components/dashboard/CoachRiskTable";
import WeeklyVolumeChart from "@/components/dashboard/WeeklyVolumeChart";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";
import EmptyState from "@/components/ui/EmptyState";
import { useSwimmers, useSessions } from "@/hooks";

export default function CoachHomePage() {
  const { swimmers, isLoading: swimmersLoading, error: swimmersError, refetch } = useSwimmers();
  const { sessions, isLoading: sessionsLoading } = useSessions();

  const error = swimmersError;
  const showInitialLoad = swimmersLoading && !swimmers;

  const teamAvg =
    swimmers && swimmers.length > 0
      ? Math.round(
          (swimmers.reduce((sum, s) => sum + s.averageQualityScore, 0) / swimmers.length) * 10
        ) / 10
      : 0;

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-display font-bold text-white">Your swimmers</h1>
          <p className="text-slate-400 text-sm mt-1">
            Freestyle, Breaststroke, and Butterfly quality per swimmer
          </p>
        </div>
        <Link
          href="/coach/compare"
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border border-aqua-300/30 text-aqua-300 text-sm hover:bg-aqua-300/10 transition-colors"
        >
          <GitCompare className="w-4 h-4" />
          Compare sessions
        </Link>
      </div>

      {swimmers && (
        <div className="flex flex-wrap gap-3">
          <div className="glass-card px-4 py-2 text-sm">
            <span className="text-slate-500">Swimmers </span>
            <span className="font-bold text-white">{swimmers.length}</span>
          </div>
          <div className="glass-card px-4 py-2 text-sm">
            <span className="text-slate-500">Team avg </span>
            <span className="font-bold text-aqua-300">{teamAvg}</span>
          </div>
        </div>
      )}

      {showInitialLoad && <LoadingState message="Loading swimmers..." />}
      {error && <ErrorState message={error} onRetry={refetch} />}
      {!error && swimmers?.length === 0 && !swimmersLoading && (
        <EmptyState message="No swimmers assigned yet." />
      )}
      {swimmers && swimmers.length > 0 && sessions && (
        <>
          <CoachRiskTable swimmers={swimmers} sessions={sessions} />
          <WeeklyVolumeChart sessions={sessions} />
          <SimpleSwimmerList swimmers={swimmers} sessions={sessions} />
        </>
      )}
      {sessionsLoading && swimmers && !sessions && (
        <p className="text-xs text-slate-500 text-center">Loading sessions...</p>
      )}
    </>
  );
}
