"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { homePathForRole } from "@/lib/access";
import LoadingState from "@/components/ui/LoadingState";

export default function HomeRedirect() {
  const router = useRouter();
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    router.replace(homePathForRole(user.role));
  }, [hydrated, user, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-ocean-950">
      <LoadingState />
    </div>
  );
}
