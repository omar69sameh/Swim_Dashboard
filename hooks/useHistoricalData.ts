"use client";

import { getHistoricalDataService } from "@/services";
import { useAsyncData } from "./useAsyncData";

export function useHistoricalData(swimmerId: string | undefined) {
  const { data, isLoading, error, refetch } = useAsyncData(
    () => {
      if (!swimmerId) return Promise.resolve([]);
      return getHistoricalDataService().getHistory(swimmerId);
    },
    [swimmerId]
  );

  return { history: data, isLoading, error, refetch };
}
