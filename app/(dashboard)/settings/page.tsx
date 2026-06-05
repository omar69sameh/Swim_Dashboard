"use client";

import Link from "next/link";
import { User } from "lucide-react";
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
          <CoachSelector />
        )}

        <div className="border-t border-white/10 pt-4 space-y-3">
          {user?.role === "swimmer" && (
            <Link
              href="/profile"
              className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-colors group"
            >
              <div className="w-8 h-8 rounded-lg bg-aqua-500/15 border border-aqua-300/20 flex items-center justify-center shrink-0">
                <User className="w-4 h-4 text-aqua-300" />
              </div>
              <div className="text-left">
                <p className="text-sm font-medium text-slate-200">View Profile</p>
                <p className="text-xs text-slate-500">See your full swimmer profile</p>
              </div>
            </Link>
          )}

          <ChangePasswordForm />
        </div>

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
