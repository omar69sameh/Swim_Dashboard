"use client";

import { getSwimmerService } from "@/services";
import { useAsyncData } from "./useAsyncData";

export function useSwimmer(id: string | undefined) {
  const { data, isLoading, error, refetch } = useAsyncData(
    () => {
      if (!id) return Promise.resolve(null);
      return getSwimmerService().getSwimmer(id);
    },
    [id],
    { cacheKey: id ? `swimmer:${id}` : undefined }
  );

  return { swimmer: data, isLoading, error, refetch };
}
