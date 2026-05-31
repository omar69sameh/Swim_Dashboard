"use client";

import { getDataProvider, getMLAnalysisService, ServiceError } from "@/services";
import type { AnalysisStatus } from "@/types";
import { useAsyncData } from "./useAsyncData";

export function useMLResults(
  sessionId: string | undefined,
  sessionStatus?: AnalysisStatus
) {
  const provider = getDataProvider();
  const isPending =
    sessionStatus === "pending" || sessionStatus === "processing";
  const isFailedStatus = sessionStatus === "failed";
  const shouldFetch =
    !!sessionId &&
    (provider === "mock" || sessionStatus === "completed");

  const { data, isLoading, isValidating, error, refetch } = useAsyncData(
    async () => {
      if (!sessionId || !shouldFetch) return null;
      return getMLAnalysisService().getResults(sessionId);
    },
    [sessionId, shouldFetch, sessionStatus]
  );

  const isProcessing =
    isPending ||
    (error !== null &&
      error.toLowerCase().includes("not yet complete"));

  const isFailed =
    isFailedStatus ||
    (error !== null &&
      (error.toLowerCase().includes("analysis failed") ||
        error.includes("422")));

  const displayError =
    error && !isProcessing && !isFailed ? error : null;

  return {
    mlResults: data,
    isLoading: shouldFetch && isLoading,
    isValidating,
    error: displayError,
    refetch,
    isProcessing,
    isFailed,
  };
}
