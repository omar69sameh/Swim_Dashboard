"use client";

import { Suspense, useEffect, useRef, useState } from "react";
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
  const settled = useRef(false);

  function markReady() {
    if (settled.current) return;
    settled.current = true;
    setReady(true);
    setError(null);
  }

  function markExpired() {
    if (settled.current) return;
    settled.current = true;
    setError("Reset link has expired or already been used. Please request a new one.");
    setReady(true);
  }

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    async function init() {
      // ── Path 1: Implicit flow (mobile app reset) ──────────────────────────
      // Supabase puts tokens in the URL hash: #access_token=XXX&type=recovery
      // The PKCE-mode browser client ignores hashes, so we parse manually.
      const hash = window.location.hash.slice(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken  = params.get("access_token");
        const refreshToken = params.get("refresh_token") ?? "";
        const type         = params.get("type");

        if (accessToken && type === "recovery") {
          // Remove tokens from the visible URL immediately
          window.history.replaceState(null, "", window.location.pathname);

          const { error: sessionErr } = await supabase.auth.setSession({
            access_token:  accessToken,
            refresh_token: refreshToken,
          });

          if (!sessionErr) { markReady(); return; }
          markExpired(); return;
        }
      }

      // ── Path 2: PKCE flow (dashboard reset) ──────────────────────────────
      // /auth/callback already exchanged the code and set session cookies.
      // getSession() returns the session immediately.
      const { data: { session } } = await supabase.auth.getSession();
      if (session) { markReady(); return; }

      // ── Path 3: onAuthStateChange — PASSWORD_RECOVERY fires when the
      // PKCE session arrives slightly after page load.
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
            markReady();
          }
        }
      );

      // ── Fallback: give it 4 seconds then show expired ─────────────────────
      const timer = setTimeout(markExpired, 4000);

      return () => {
        subscription.unsubscribe();
        clearTimeout(timer);
      };
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setTimeout(() => router.replace("/login"), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };

  // ── States ────────────────────────────────────────────────────────────────

  if (!ready) {
    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <div className="w-6 h-6 border-2 border-aqua-300/30 border-t-aqua-300 rounded-full animate-spin" />
        <p className="text-sm text-slate-400">Verifying reset link…</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rounded-lg bg-aqua-500/10 border border-aqua-300/30 px-4 py-3">
        <p className="text-aqua-300 font-medium">✓ Password updated! Redirecting to sign in…</p>
      </div>
    );
  }

  if (error && !password) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-display font-bold text-white">Set new password</h1>
        <p className="text-sm text-rose-400">{error}</p>
        <a href="/forgot-password" className="inline-block text-sm text-aqua-300 hover:text-aqua-200">
          ← Request a new reset link
        </a>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-display font-bold text-white mb-1">Set new password</h1>
      <p className="text-sm text-slate-400 mb-6">Choose a strong password for your account.</p>

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
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-aqua-500 hover:bg-aqua-400 text-ocean-950 font-medium text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
