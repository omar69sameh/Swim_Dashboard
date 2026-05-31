"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";
import LoadingState from "@/components/ui/LoadingState";

export default function LegacySessionRedirect() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!user) {
      router.replace("/login");
      return;
    }
    const base = user.role === "coach" ? "/coach/session" : "/swimmer/session";
    router.replace(`${base}/${id}`);
  }, [router, id, user]);

  return <LoadingState />;
}
