"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Search, Plus, RefreshCw, Pencil, Trash2, CheckCircle2, AlertTriangle } from "lucide-react";
import type { AdminUser } from "@/services/admin/admin.types";

type RoleFilter = "all" | "swimmer" | "coach" | "admin";

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function roleChip(role: string) {
  if (role === "admin")
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-violet-400/15 text-violet-300 border border-violet-400/20">Admin</span>;
  if (role === "coach")
    return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-aqua-300/15 text-aqua-300 border border-aqua-300/20">Coach</span>;
  return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-400/15 text-emerald-400 border border-emerald-400/20">Swimmer</span>;
}

interface UsersTableProps {
  users: AdminUser[];
  loading: boolean;
  onEdit: (user: AdminUser) => void;
  onDelete: (user: AdminUser) => void;
  onCreateNew: () => void;
}

export function UsersTable({ users, loading, onEdit, onDelete, onCreateNew }: UsersTableProps) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");

  const total = users.length;
  const numSwimmers = users.filter((u) => u.role === "swimmer").length;
  const numCoaches = users.filter((u) => u.role === "coach").length;
  const numAdmins = users.filter((u) => u.role === "admin").length;

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const q = search.toLowerCase();
    return matchRole && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  return (
    <>
      {/* Search + filter + create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/40"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "swimmer", "coach", "admin"] as RoleFilter[]).map((r) => (
            <button
              key={r}
              onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                roleFilter === r
                  ? "bg-aqua-300/20 text-aqua-300 border border-aqua-300/30"
                  : "border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {r === "all"     ? `All (${total})`               :
               r === "swimmer" ? `Swimmers (${numSwimmers})`    :
               r === "coach"   ? `Coaches (${numCoaches})`      :
                                 `Admins (${numAdmins})`}
            </button>
          ))}
          <button
            onClick={onCreateNew}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aqua-300 text-ocean-950 font-semibold text-xs hover:bg-aqua-400 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> New user
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {loading && users.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
            <p className="text-sm text-slate-500">Loading users…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <p className="text-sm text-slate-500">No users match your search.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">User</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Role</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Sessions</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden sm:table-cell">Joined</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Last sign-in</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide hidden md:table-cell">Status</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u, i) => (
                  <motion.tr
                    key={u.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.03 }}
                    className="border-b border-white/5 last:border-0 hover:bg-white/3 transition-colors group"
                  >
                    <td className="px-4 py-3">
                      <div>
                        <p className="font-medium text-white leading-tight">{u.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{u.email}</p>
                      </div>
                    </td>
                    <td className="px-4 py-3">{roleChip(u.role)}</td>
                    <td className="px-4 py-3">
                      <span className="text-slate-300 font-medium">{u.sessionCount}</span>
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell">
                      <span className="text-xs text-slate-400">{fmtDate(u.createdAt)}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-xs text-slate-400">{fmtDate(u.lastSignIn)}</span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {u.confirmed ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-400">
                          <CheckCircle2 className="w-3 h-3" /> Confirmed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-400">
                          <AlertTriangle className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => onEdit(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
