"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import { readStoredSession } from "@/lib/mock-auth";
import { homePathForRole } from "@/lib/access";
import LoadingState from "@/components/ui/LoadingState";

export default function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, hydrated, setUser, setHydrated } = useAuthStore();

  useEffect(() => {
    if (hydrated) return;
    const stored = readStoredSession();
    if (stored) setUser(stored);
    setHydrated(true);
  }, [hydrated, setUser, setHydrated]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (pathname.startsWith("/admin") && user.role !== "admin") {
      router.replace(homePathForRole(user.role));
      return;
    }
    if (pathname.startsWith("/coach") && user.role !== "coach" && user.role !== "admin") {
      router.replace(homePathForRole(user.role));
      return;
    }
    if (
      (pathname === "/swimmer" ||
        pathname.startsWith("/swimmer/") ||
        pathname === "/profile") &&
      user.role !== "swimmer"
    ) {
      router.replace(homePathForRole(user.role));
    }
  }, [hydrated, user, pathname, router]);

  if (!hydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-ocean-950">
        <LoadingState message="Loading..." />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
