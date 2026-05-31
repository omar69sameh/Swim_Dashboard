"use client";

import { getSessionService } from "@/services";
import { useAsyncData } from "./useAsyncData";

export function useSession(id: string | undefined) {
  const { data, isLoading, error, refetch } = useAsyncData(
    () => {
      if (!id) return Promise.resolve(null);
      return getSessionService().getSession(id);
    },
    [id]
  );

  return { session: data, isLoading, error, refetch };
}
