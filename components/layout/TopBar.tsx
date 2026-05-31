"use client";

import { Menu, LogOut } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { useAuth } from "@/hooks/useAuth";

export default function TopBar() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const { user, signOut } = useAuth();

  return (
    <header className="h-14 md:h-16 glass-panel border-b border-white/5 flex items-center justify-between px-4 md:px-6 sticky top-0 z-20">
      <button
        type="button"
        onClick={toggleSidebar}
        className="p-2 rounded-lg hover:bg-white/5 text-slate-400 md:hidden"
        aria-label="Open menu"
      >
        <Menu className="w-5 h-5" />
      </button>

      <div className="hidden md:block flex-1" />

      <div className="flex items-center gap-3 ml-auto">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-slate-200">{user?.name ?? "Guest"}</p>
          <p className="text-xs text-slate-500 capitalize">{user?.role ?? ""}</p>
        </div>
        <button
          type="button"
          onClick={() => signOut()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-aqua-300 hover:bg-white/5 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </header>
  );
}
