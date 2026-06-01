"use client";

import type { UserProfile } from "@/types/auth";
import { useAsyncData } from "./useAsyncData";

async function fetchProfile(): Promise<UserProfile> {
  const res = await fetch("/api/profile", {
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Failed to load profile");
  }
  return res.json() as Promise<UserProfile>;
}

export function useProfile(enabled = true) {
  const { data, isLoading, error, refetch } = useAsyncData(
    () => (enabled ? fetchProfile() : Promise.resolve(null as unknown as UserProfile)),
    [enabled]
  );

  return { profile: data, isLoading, error, refetch };
}
