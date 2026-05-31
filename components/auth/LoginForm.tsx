"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/hooks/useAuth";
import { getDemoAccounts } from "@/lib/mock-auth";

export default function LoginForm() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-display font-bold text-white mb-1">Sign in</h1>
      <p className="text-sm text-slate-400 mb-6">Coaches and swimmers use the same login.</p>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
          />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-aqua-500 hover:bg-aqua-400 text-ocean-950 font-medium text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-500 text-center">
        No account?{" "}
        <Link href="/signup" className="text-aqua-300 hover:text-aqua-200">
          Sign up
        </Link>
      </p>

      <div className="mt-8 pt-6 border-t border-white/10">
        <p className="text-xs text-slate-500 mb-2">Demo accounts</p>
        <ul className="text-xs text-slate-400 space-y-1">
          {getDemoAccounts().map((a) => (
            <li key={a.email}>
              {a.role}: {a.email} / {a.password}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
