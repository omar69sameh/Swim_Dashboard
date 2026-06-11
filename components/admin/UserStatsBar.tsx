"use client";

import { Users, UserCheck, Dumbbell, Activity } from "lucide-react";
import type { AdminUser } from "@/services/admin/admin.types";

interface UserStatsBarProps {
  users: AdminUser[];
}

export function UserStatsBar({ users }: UserStatsBarProps) {
  const total = users.length;
  const numSwimmers = users.filter((u) => u.role === "swimmer").length;
  const numCoaches = users.filter((u) => u.role === "coach").length;
  const totalSessions = users.reduce((s, u) => s + u.sessionCount, 0);

  const stats = [
    { label: "Total users",    value: total,         icon: Users,     color: "text-white"        },
    { label: "Swimmers",       value: numSwimmers,   icon: Dumbbell,  color: "text-emerald-400"  },
    { label: "Coaches",        value: numCoaches,    icon: UserCheck, color: "text-aqua-300"     },
    { label: "Total sessions", value: totalSessions, icon: Activity,  color: "text-violet-400"   },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {stats.map(({ label, value, icon: Icon, color }) => (
        <div key={label} className="glass-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Icon className={`w-4 h-4 ${color}`} />
            <span className="text-xs text-slate-500">{label}</span>
          </div>
          <span className={`text-2xl font-bold font-display ${color}`}>{value}</span>
        </div>
      ))}
    </div>
  );
}
