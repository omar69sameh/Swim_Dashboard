"use client";

import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import CoachSelector from "@/components/settings/CoachSelector";
import ChangePasswordForm from "@/components/settings/ChangePasswordForm";
import LoadingState from "@/components/ui/LoadingState";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const { profile, isLoading } = useProfile(!!user);

  return (
    <>
      <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
      <p className="text-sm text-slate-400 mb-6">Account and preferences</p>

      <div className="glass-card p-5 space-y-4 max-w-md">
        {isLoading && user?.role === "swimmer" ? (
          <LoadingState message="Loading..." />
        ) : (
          <>
            <div>
              <p className="text-xs text-slate-500">Name</p>
              <p className="text-slate-200">{profile?.name ?? user?.name}</p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Email</p>
              <p className="text-slate-200">{profile?.email ?? user?.email}</p>
            </div>
            {user?.role === "swimmer" && (
              <>
                <div>
                  <p className="text-xs text-slate-500">Age</p>
                  <p className="text-slate-200">
                    {profile?.age != null ? profile.age : "Not set"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-slate-500">Coach</p>
                  <p className="text-slate-200">
                    {profile?.coachName ?? "No coach assigned"}
                  </p>
                </div>
              </>
            )}
            <div>
              <p className="text-xs text-slate-500">Role</p>
              <p className="text-slate-200 capitalize">{user?.role}</p>
            </div>
          </>
        )}

        {user?.role === "swimmer" && (
          <>
            <CoachSelector />
            <Link href="/profile" className="text-sm text-aqua-300 hover:text-aqua-200">
              View full profile →
            </Link>
          </>
        )}

        <ChangePasswordForm />

        <button
          type="button"
          onClick={() => signOut()}
          className="w-full py-2.5 rounded-lg border border-white/10 text-slate-300 hover:bg-white/5 text-sm"
        >
          Sign out
        </button>
      </div>
    </>
  );
}
