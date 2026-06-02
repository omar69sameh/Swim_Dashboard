"use client";

import { useState } from "react";

export default function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next !== confirm) { setError("Passwords do not match"); return; }
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed to update password");
      setMessage("Password updated successfully");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update password");
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-sm text-aqua-300 hover:text-aqua-200"
      >
        Change password →
      </button>
    );
  }

  return (
    <form onSubmit={handleSave} className="space-y-3 pt-3 border-t border-white/10">
      <p className="text-xs text-slate-500 font-medium">Change password</p>
      {(["Current password", "New password", "Confirm new password"] as const).map((label, i) => {
        const vals = [current, next, confirm];
        const setters = [setCurrent, setNext, setConfirm];
        return (
          <div key={label}>
            <label className="block text-xs text-slate-500 mb-1">{label}</label>
            <input
              type="password"
              required
              minLength={i === 0 ? 1 : 6}
              value={vals[i]}
              onChange={(e) => setters[i](e.target.value)}
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
            />
          </div>
        );
      })}
      {error && <p className="text-sm text-rose-400">{error}</p>}
      {message && (
        <div className="flex items-center gap-2 rounded-lg bg-aqua-500/10 border border-aqua-300/30 px-3 py-2">
          <span className="text-aqua-300 text-lg">✓</span>
          <p className="text-sm text-aqua-300 font-medium">{message}</p>
        </div>
      )}
      <div className="flex gap-2">
        {!message && (
          <button
            type="submit"
            disabled={loading}
            className="flex-1 py-2 rounded-lg bg-aqua-500/20 border border-aqua-300/30 text-aqua-300 text-sm hover:bg-aqua-500/30 disabled:opacity-50"
          >
            {loading ? "Saving..." : "Update password"}
          </button>
        )}
        <button
          type="button"
          onClick={() => { setOpen(false); setError(null); setMessage(null); setCurrent(""); setNext(""); setConfirm(""); }}
          className={`px-4 py-2 rounded-lg border border-white/10 text-slate-400 text-sm hover:bg-white/5 ${message ? "w-full" : ""}`}
        >
          {message ? "Done" : "Cancel"}
        </button>
      </div>
    </form>
  );
}
