"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/hooks/useAuth";
import { homePathForRole } from "@/lib/access";
import LoadingState from "@/components/ui/LoadingState";

export default function LoginPage() {
  const router = useRouter();
  const { user, hydrated } = useAuth();

  useEffect(() => {
    if (hydrated && user) {
      router.replace(homePathForRole(user.role));
    }
  }, [hydrated, user, router]);

  if (!hydrated) {
    return <LoadingState message="Loading..." />;
  }

  if (user) {
    return <LoadingState message="Redirecting..." />;
  }

  return <LoginForm />;
}
