"use client";

import { getCoachesService } from "@/services/coaches/coaches.service";
import { useAsyncData } from "./useAsyncData";

export function useCoaches(enabled = true) {
  const { data, isLoading, error } = useAsyncData(
    () => (enabled ? getCoachesService().listCoaches() : Promise.resolve([])),
    [enabled]
  );

  return { coaches: data ?? [], isLoading, error };
}
