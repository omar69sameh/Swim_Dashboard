"use client";

import { useCallback, useEffect, useState } from "react";
import { useCoaches } from "@/hooks/useCoaches";
import type { UserProfile } from "@/types/auth";

export default function CoachSelector() {
  const { coaches, isLoading: coachesLoading } = useCoaches(true);
  const [coachId, setCoachId] = useState("");
  const [age, setAge] = useState("");
  const [currentCoachName, setCurrentCoachName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", { credentials: "include" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not load profile");
      }
      const data = (await res.json()) as UserProfile;
      setCoachId(data.coachId ?? "");
      setCurrentCoachName(data.coachName);
      setAge(data.age != null ? String(data.age) : "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const ageNum = age.trim() ? parseInt(age, 10) : undefined;
      if (age.trim() && (!Number.isFinite(ageNum) || ageNum! < 1 || ageNum! > 120)) {
        throw new Error("Age must be between 1 and 120");
      }

      const res = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId: coachId || null,
          ...(ageNum != null ? { age: ageNum } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Could not save");
      }
      const data = (await res.json()) as UserProfile;
      setCurrentCoachName(data.coachName);
      setMessage("Profile updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">Loading...</p>;
  }

  return (
    <div className="space-y-3 pt-2 border-t border-white/10">
      <div>
        <label className="block text-xs text-slate-500 mb-1">Age</label>
        <input
          type="number"
          min={1}
          max={120}
          value={age}
          onChange={(e) => setAge(e.target.value)}
          className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
        />
      </div>
      <div>
        <p className="text-xs text-slate-500 mb-1">Your coach</p>
        {currentCoachName && (
          <p className="text-sm text-slate-400 mb-2">Current: {currentCoachName}</p>
        )}
        <select
          value={coachId}
          onChange={(e) => setCoachId(e.target.value)}
          disabled={coachesLoading || saving}
          className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
        >
          <option value="">No coach selected</option>
          {coaches.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {!coachesLoading && coaches.length === 0 && (
          <p className="text-xs text-slate-500 mt-1">No coaches registered yet.</p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void handleSave()}
        disabled={saving}
        className="w-full py-2 rounded-lg bg-aqua-500/20 border border-aqua-300/30 text-aqua-300 text-sm hover:bg-aqua-500/30 disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save changes"}
      </button>
      {message && <p className="text-sm text-aqua-300">{message}</p>}
      {error && <p className="text-sm text-rose-400">{error}</p>}
    </div>
  );
}
