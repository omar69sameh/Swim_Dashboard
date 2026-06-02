"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<p className="text-slate-400 text-sm">Loading...</p>}>
      <ResetForm />
    </Suspense>
  );
}

function ResetForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // The @supabase/ssr browser client auto-exchanges the ?code= on page load.
  // We just wait briefly then check if a recovery session exists.
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const timer = setTimeout(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Reset link has expired or already been used. Please request a new one.");
      }
      setReady(true);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }
    setLoading(true);
    setError(null);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) throw err;
      setDone(true);
      setTimeout(() => router.replace("/login"), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return <p className="text-sm text-slate-400">Verifying reset link...</p>;
  }

  if (done) {
    return (
      <div className="rounded-lg bg-aqua-500/10 border border-aqua-300/30 px-4 py-3">
        <p className="text-aqua-300 font-medium">✓ Password updated! Redirecting to sign in...</p>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-display font-bold text-white mb-1">Set new password</h1>
      <p className="text-sm text-slate-400 mb-6">Choose a strong password for your account.</p>

      {error ? (
        <div className="space-y-4">
          <p className="text-sm text-rose-400">{error}</p>
          <a href="/forgot-password" className="text-sm text-aqua-300 hover:text-aqua-200">
            ← Request a new reset link
          </a>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">New password</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Confirm password</label>
            <input
              type="password"
              required
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-aqua-500 hover:bg-aqua-400 text-ocean-950 font-medium text-sm transition-colors disabled:opacity-50"
          >
            {loading ? "Saving..." : "Set new password"}
          </button>
        </form>
      )}
    </div>
  );
}
