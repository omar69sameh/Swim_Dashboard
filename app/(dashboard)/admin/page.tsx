"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users,
  UserCheck,
  Dumbbell,
  ShieldCheck,
  Trash2,
  Pencil,
  Plus,
  Search,
  X,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Eye,
  EyeOff,
  Activity,
} from "lucide-react";

/* ══════════════════════════════════════════════════════
   TYPES
══════════════════════════════════════════════════════ */
interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "swimmer" | "coach" | "admin";
  age: number | null;
  coachId: string | null;
  sessionCount: number;
  createdAt: string;
  lastSignIn: string | null;
  confirmed: boolean;
}

type RoleFilter = "all" | "swimmer" | "coach" | "admin";

/* ══════════════════════════════════════════════════════
   HELPERS
══════════════════════════════════════════════════════ */
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

/* ══════════════════════════════════════════════════════
   TOAST
══════════════════════════════════════════════════════ */
function Toast({ msg, type }: { msg: string; type: "success" | "error" }) {
  return (
    <motion.div
      key="toast"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg z-[100] text-sm font-medium ${
        type === "success" ? "bg-emerald-500/90 text-white" : "bg-rose-500/90 text-white"
      }`}
    >
      {type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
      {msg}
    </motion.div>
  );
}

/* ══════════════════════════════════════════════════════
   CONFIRM DELETE MODAL
══════════════════════════════════════════════════════ */
function ConfirmModal({
  title,
  description,
  warning,
  onClose,
  onConfirm,
}: {
  title: string;
  description: React.ReactNode;
  warning?: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function go() {
    setErr("");
    setBusy(true);
    try {
      await onConfirm();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card border border-rose-400/20 rounded-2xl p-6 w-full max-w-sm"
      >
        <div className="flex flex-col items-center text-center gap-3 mb-5">
          <div className="w-12 h-12 rounded-full bg-rose-400/10 flex items-center justify-center">
            <Trash2 className="w-6 h-6 text-rose-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">{title}</h2>
            <p className="text-sm text-slate-400">{description}</p>
          </div>
        </div>
        {warning && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-400/10 border border-amber-400/20 mb-4">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <p className="text-xs text-amber-300">{warning}</p>
          </div>
        )}
        {err && <p className="text-xs text-rose-400 mb-3">{err}</p>}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/5 transition-colors">
            Cancel
          </button>
          <button
            onClick={go}
            disabled={busy}
            className="flex-1 py-2 rounded-lg bg-rose-500 text-white font-semibold text-sm hover:bg-rose-600 transition-colors disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Yes, delete"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   EDIT USER MODAL
══════════════════════════════════════════════════════ */
function EditModal({
  user,
  coaches,
  onClose,
  onSave,
}: {
  user: AdminUser;
  coaches: AdminUser[];
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [role, setRole] = useState(user.role);
  const [age, setAge] = useState<string>(user.age != null ? String(user.age) : "");
  const [coachId, setCoachId] = useState<string>(user.coachId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          role,
          age: role === "swimmer" && age ? parseInt(age) : null,
          coachId: role === "swimmer" && coachId ? coachId : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to update");
      onSave();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to update");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card border border-white/10 rounded-2xl p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Edit User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email (read-only)</label>
            <input value={user.email} disabled
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as AdminUser["role"])}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50">
              <option value="swimmer">Swimmer</option>
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === "swimmer" && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Age</label>
                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min={1} max={120}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Assign to Coach</label>
                <select value={coachId} onChange={(e) => setCoachId(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50">
                  <option value="">— No coach —</option>
                  {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                </select>
              </div>
            </>
          )}
          {error && <p className="text-xs text-rose-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-aqua-300 text-ocean-950 font-semibold text-sm hover:bg-aqua-400 transition-colors disabled:opacity-50">
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   CREATE USER MODAL
══════════════════════════════════════════════════════ */
function CreateModal({
  coaches,
  onClose,
  onCreated,
}: {
  coaches: AdminUser[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [role, setRole] = useState<"swimmer" | "coach" | "admin">("swimmer");
  const [age, setAge] = useState("");
  const [coachId, setCoachId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    setError("");
    if (!name.trim() || !email.trim() || !password) { setError("Name, email and password required"); return; }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), password, role,
          age: role === "swimmer" && age ? parseInt(age) : undefined,
          coachId: role === "swimmer" && coachId ? coachId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create");
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="glass-card border border-white/10 rounded-2xl p-6 w-full max-w-md"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-white">Create User</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="John Smith"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/50" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com"
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/50" />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Password</label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 characters"
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/50" />
              <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Role</label>
            <select value={role} onChange={(e) => setRole(e.target.value as "swimmer" | "coach" | "admin")}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50">
              <option value="swimmer">Swimmer</option>
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          {role === "swimmer" && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Age</label>
                <input type="number" value={age} onChange={(e) => setAge(e.target.value)} min={1} max={120} placeholder="e.g. 18"
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/50" />
              </div>
              {coaches.length > 0 && (
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Assign to Coach</label>
                  <select value={coachId} onChange={(e) => setCoachId(e.target.value)}
                    className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50">
                    <option value="">— No coach —</option>
                    {coaches.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
                  </select>
                </div>
              )}
            </>
          )}
          {error && <p className="text-xs text-rose-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {error}</p>}
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/5 transition-colors">Cancel</button>
          <button onClick={handleCreate} disabled={saving}
            className="flex-1 py-2 rounded-lg bg-aqua-300 text-ocean-950 font-semibold text-sm hover:bg-aqua-400 transition-colors disabled:opacity-50">
            {saving ? "Creating…" : "Create user"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   MAIN PAGE
══════════════════════════════════════════════════════ */
export default function AdminPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  function showToast(msg: string, type: "success" | "error" = "success") {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3500);
  }

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      if (res.ok) setUsers(data.users ?? []);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const coaches = users.filter((u) => u.role === "coach");
  const total = users.length;
  const numSwimmers = users.filter((u) => u.role === "swimmer").length;
  const numCoaches = users.filter((u) => u.role === "coach").length;
  const numAdmins = users.filter((u) => u.role === "admin").length;
  const totalSessions = users.reduce((s, u) => s + u.sessionCount, 0);

  const filtered = users.filter((u) => {
    const matchRole = roleFilter === "all" || u.role === roleFilter;
    const q = search.toLowerCase();
    return matchRole && (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  });

  async function deleteUserFn(user: AdminUser) {
    const res = await fetch(`/api/admin/users/${user.id}`, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Failed to delete");
    fetchUsers();
    showToast("User deleted successfully");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-violet-400" />
            Admin Dashboard
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage swimmers and coaches</p>
        </div>
        <button onClick={fetchUsers}
          className="p-2 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:bg-white/5 transition-colors" title="Refresh">
          <RefreshCw className={`w-4 h-4 ${usersLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total users", value: total, icon: Users, color: "text-white" },
          { label: "Swimmers", value: numSwimmers, icon: Dumbbell, color: "text-emerald-400" },
          { label: "Coaches", value: numCoaches, icon: UserCheck, color: "text-aqua-300" },
          { label: "Total sessions", value: totalSessions, icon: Activity, color: "text-violet-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="glass-card p-4">
            <div className="flex items-center gap-2 mb-1">
              <Icon className={`w-4 h-4 ${color}`} />
              <span className="text-xs text-slate-500">{label}</span>
            </div>
            <span className={`text-2xl font-bold font-display ${color}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* Search + filter + create */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email…"
            className="w-full bg-white/5 border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-aqua-300/40" />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "swimmer", "coach", "admin"] as RoleFilter[]).map((r) => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                roleFilter === r
                  ? "bg-aqua-300/20 text-aqua-300 border border-aqua-300/30"
                  : "border border-white/10 text-slate-400 hover:text-white hover:bg-white/5"
              }`}>
              {r === "all" ? `All (${total})` : r === "swimmer" ? `Swimmers (${numSwimmers})` : r === "coach" ? `Coaches (${numCoaches})` : `Admins (${numAdmins})`}
            </button>
          ))}
          <button onClick={() => setShowCreate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-aqua-300 text-ocean-950 font-semibold text-xs hover:bg-aqua-400 transition-colors">
            <Plus className="w-3.5 h-3.5" /> New user
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="glass-card overflow-hidden">
        {usersLoading && users.length === 0 ? (
          <div className="p-12 flex flex-col items-center gap-3">
            <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
            <p className="text-sm text-slate-500">Loading users…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center"><p className="text-sm text-slate-500">No users match your search.</p></div>
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
                  <motion.tr key={u.id}
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
                    <td className="px-4 py-3"><span className="text-slate-300 font-medium">{u.sessionCount}</span></td>
                    <td className="px-4 py-3 hidden sm:table-cell"><span className="text-xs text-slate-400">{fmtDate(u.createdAt)}</span></td>
                    <td className="px-4 py-3 hidden md:table-cell"><span className="text-xs text-slate-400">{fmtDate(u.lastSignIn)}</span></td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      {u.confirmed
                        ? <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="w-3 h-3" /> Confirmed</span>
                        : <span className="flex items-center gap-1 text-xs text-amber-400"><AlertTriangle className="w-3 h-3" /> Pending</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => setEditUser(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors" title="Edit">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setDeleteUser(u)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors" title="Delete">
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

      {/* Modals */}
      <AnimatePresence>
        {editUser && (
          <EditModal user={editUser} coaches={coaches} onClose={() => setEditUser(null)}
            onSave={() => { setEditUser(null); fetchUsers(); showToast("User updated successfully"); }} />
        )}
        {deleteUser && (
          <ConfirmModal
            title="Delete User?"
            description={<>Delete <span className="text-white font-medium">{deleteUser.name}</span> ({deleteUser.email})?</>}
            warning={deleteUser.sessionCount > 0 ? `${deleteUser.sessionCount} session${deleteUser.sessionCount > 1 ? "s" : ""} will also be deleted.` : undefined}
            onClose={() => setDeleteUser(null)}
            onConfirm={async () => { await deleteUserFn(deleteUser); setDeleteUser(null); }}
          />
        )}
        {showCreate && (
          <CreateModal coaches={coaches} onClose={() => setShowCreate(false)}
            onCreated={() => { setShowCreate(false); fetchUsers(); showToast("User created successfully"); }} />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && <Toast msg={toast.msg} type={toast.type} />}
      </AnimatePresence>
    </div>
  );
}
