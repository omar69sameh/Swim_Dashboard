"use client";

import { useAuth } from "@/hooks/useAuth";

export default function SettingsPage() {
  const { user, signOut } = useAuth();

  return (
    <>
      <h1 className="text-2xl font-display font-bold text-white">Settings</h1>
      <div className="glass-card p-5 space-y-4 max-w-md">
        <div>
          <p className="text-xs text-slate-500">Name</p>
          <p className="text-slate-200">{user?.name}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Email</p>
          <p className="text-slate-200">{user?.email}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Role</p>
          <p className="text-slate-200 capitalize">{user?.role}</p>
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
