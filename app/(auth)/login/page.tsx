"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import LoginForm from "@/components/auth/LoginForm";
import { useAuth } from "@/hooks/useAuth";
import { homePathForRole } from "@/lib/access";
import LoadingState from "@/components/ui/LoadingState";

function LoginPageInner() {
  const router = useRouter();
  const { user, hydrated } = useAuth();
  const params = useSearchParams();
  const resetError = params.get("error") === "invalid_reset_link";

  useEffect(() => {
    if (hydrated && user) {
      router.replace(homePathForRole(user.role));
    }
  }, [hydrated, user, router]);

  if (!hydrated) return <LoadingState message="Loading..." />;
  if (user) return <LoadingState message="Redirecting..." />;

  return (
    <>
      {resetError && (
        <div className="mb-4 rounded-lg bg-rose-500/10 border border-rose-500/20 px-4 py-3">
          <p className="text-sm text-rose-400">
            Reset link is invalid or has expired.{" "}
            <a href="/forgot-password" className="underline hover:text-rose-300">
              Request a new one.
            </a>
          </p>
        </div>
      )}
      <LoginForm />
    </>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingState message="Loading..." />}>
      <LoginPageInner />
    </Suspense>
  );
}
