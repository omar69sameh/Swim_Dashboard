"use client";

import { getTeamMetricsService } from "@/services";
import { useAsyncData } from "./useAsyncData";

export function useTeamMetrics() {
  const { data, isLoading, error, refetch } = useAsyncData(
    () => getTeamMetricsService().getTeamMetrics(),
    []
  );

  return { teamMetrics: data, isLoading, error, refetch };
}
