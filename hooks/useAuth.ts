"use client";

import { useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getAuthService } from "@/services";
import { useAuthStore } from "@/lib/auth-store";
import { readStoredSession, writeStoredSession } from "@/lib/mock-auth";
import { homePathForRole } from "@/lib/access";
import type { SignInInput, SignUpInput } from "@/types/auth";

export function useAuth() {
  const router = useRouter();
  const { user, hydrated, setUser, setHydrated } = useAuthStore();

  useEffect(() => {
    if (hydrated) return;
    const stored = readStoredSession();
    if (stored) {
      setUser(stored);
    }
    setHydrated(true);
  }, [hydrated, setUser, setHydrated]);

  const signIn = useCallback(
    async (input: SignInInput) => {
      const authUser = await getAuthService().signIn(input);
      writeStoredSession(authUser);
      setUser(authUser);
      setHydrated(true);
      router.push(homePathForRole(authUser.role));
    },
    [router, setUser, setHydrated]
  );

  const signUp = useCallback(
    async (input: SignUpInput) => {
      const authUser = await getAuthService().signUp(input);
      writeStoredSession(authUser);
      setUser(authUser);
      setHydrated(true);
      router.push(homePathForRole(authUser.role));
    },
    [router, setUser, setHydrated]
  );

  const signOut = useCallback(async () => {
    await getAuthService().signOut();
    writeStoredSession(null);
    setUser(null);
    router.push("/login");
  }, [router, setUser]);

  return {
    user,
    hydrated,
    isAuthenticated: !!user,
    signIn,
    signUp,
    signOut,
  };
}
