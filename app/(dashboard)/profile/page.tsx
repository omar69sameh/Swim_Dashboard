"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
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
          className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
        >
          <div className="w-8 h-8 rounded-lg bg-aqua-500/15 border border-aqua-300/20 flex items-center justify-center shrink-0">
            <Settings className="w-4 h-4 text-aqua-300" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-200">Update in Settings</p>
            <p className="text-xs text-slate-500">Change coach or update account details</p>
          </div>
        </Link>
      </div>
    </>
  );
}
