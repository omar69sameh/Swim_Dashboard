"use client";

import { getSwimmerService } from "@/services";
import { useAuthStore } from "@/lib/auth-store";
import { getSwimmerListOptions } from "@/lib/access";
import { useAsyncData } from "./useAsyncData";

export function useSwimmers() {
  const user = useAuthStore((s) => s.user);
  const options = getSwimmerListOptions(user);

  const { data, isLoading, error, refetch } = useAsyncData(
    () => getSwimmerService().listSwimmers(options),
    [user?.id, user?.role, options?.coachId, options?.swimmerId]
  );

  return { swimmers: data, isLoading, error, refetch };
}
