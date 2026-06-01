"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { useProfile } from "@/hooks/useProfile";
import LoadingState from "@/components/ui/LoadingState";
import ErrorState from "@/components/ui/ErrorState";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-slate-200">{value}</p>
    </div>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const { profile, isLoading, error } = useProfile(user?.role === "swimmer");

  useEffect(() => {
    if (user && user.role === "coach") {
      router.replace("/coach");
    }
  }, [user, router]);

  if (!user || user.role !== "swimmer") {
    return null;
  }

  if (isLoading) {
    return <LoadingState message="Loading profile..." />;
  }

  if (error || !profile) {
    return <ErrorState message={error ?? "Could not load profile"} />;
  }

  return (
    <>
      <h1 className="text-2xl font-display font-bold text-white mb-1">My profile</h1>
      <p className="text-sm text-slate-400 mb-6">Your account details</p>

      <div className="glass-card p-5 space-y-4 max-w-md">
        <DetailRow label="Name" value={profile.name} />
        <DetailRow label="Email" value={profile.email} />
        <DetailRow
          label="Age"
          value={profile.age != null ? String(profile.age) : "Not set"}
        />
        <DetailRow
          label="Coach"
          value={profile.coachName ?? "No coach assigned"}
        />

        <Link
          href="/settings"
          className="inline-block text-sm text-aqua-300 hover:text-aqua-200"
        >
          Change coach or update details in Settings →
        </Link>
      </div>
    </>
  );
}
