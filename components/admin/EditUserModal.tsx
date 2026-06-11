"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import type { AdminUser, UpdateUserInput } from "@/services/admin/admin.types";
import { getAdminUserService } from "@/services/admin/admin.service";

interface EditUserModalProps {
  user: AdminUser;
  coaches: AdminUser[];
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, type?: "success" | "error") => void;
}

export function EditUserModal({ user, coaches, onClose, onSaved, showToast }: EditUserModalProps) {
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
      const input: UpdateUserInput = {
        name: name.trim(),
        role,
        age: role === "swimmer" && age ? parseInt(age) : null,
        coachId: role === "swimmer" && coachId ? coachId : null,
      };
      await getAdminUserService().updateUser(user.id, input);
      showToast("User updated successfully");
      onSaved();
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
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Full Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Email (read-only)</label>
            <input
              value={user.email}
              disabled
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-500 cursor-not-allowed"
            />
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as AdminUser["role"])}
              className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50"
            >
              <option value="swimmer">Swimmer</option>
              <option value="coach">Coach</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {role === "swimmer" && (
            <>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Age</label>
                <input
                  type="number"
                  value={age}
                  onChange={(e) => setAge(e.target.value)}
                  min={1}
                  max={120}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Assign to Coach</label>
                <select
                  value={coachId}
                  onChange={(e) => setCoachId(e.target.value)}
                  className="w-full bg-slate-800 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-aqua-300/50"
                >
                  <option value="">— No coach —</option>
                  {coaches.map((c) => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </div>
            </>
          )}

          {error && (
            <p className="text-xs text-rose-400 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" /> {error}
            </p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-lg border border-white/10 text-sm text-slate-400 hover:bg-white/5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex-1 py-2 rounded-lg bg-aqua-300 text-ocean-950 font-semibold text-sm hover:bg-aqua-400 transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
