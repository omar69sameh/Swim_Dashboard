"use client";

import { getSessionService } from "@/services";
import { useAuthStore } from "@/lib/auth-store";
import { getSessionFilters } from "@/lib/access";
import type { SessionFilters } from "@/services";
import { useAsyncData } from "./useAsyncData";

export function useSessions(extraFilters?: SessionFilters) {
  const user = useAuthStore((s) => s.user);
  const baseFilters = getSessionFilters(user, extraFilters?.swimmerId);
  const filters: SessionFilters | undefined = {
    ...baseFilters,
    ...extraFilters,
  };

  const { data, isLoading, error, refetch } = useAsyncData(
    () => getSessionService().listSessions(filters),
    [
      user?.id,
      filters?.swimmerId,
      filters?.swimmerIds?.join(","),
    ]
  );

  return { sessions: data, isLoading, error, refetch };
}
