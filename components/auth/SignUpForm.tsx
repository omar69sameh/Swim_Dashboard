"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useCoaches } from "@/hooks/useCoaches";
import type { UserRole } from "@/types/auth";
import { cn } from "@/lib/utils";

function passwordStrength(pw: string): { score: number; hints: string[] } {
  const hints: string[] = [];
  let score = 0;
  if (pw.length >= 8) score++; else hints.push("At least 8 characters");
  if (/[A-Z]/.test(pw)) score++; else hints.push("One uppercase letter");
  if (/[0-9]/.test(pw)) score++; else hints.push("One number");
  if (/[^A-Za-z0-9]/.test(pw)) score++; else hints.push("One special character (optional)");
  return { score, hints };
}

const STRENGTH_LABEL = ["", "Weak", "Fair", "Good", "Strong"];
const STRENGTH_COLOR = ["", "bg-rose-500", "bg-amber-500", "bg-yellow-400", "bg-emerald-500"];

export default function SignUpForm() {
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<UserRole>("swimmer");
  const [age, setAge] = useState("");
  const [coachId, setCoachId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { coaches, isLoading: coachesLoading } = useCoaches(role === "swimmer");
  const strength = passwordStrength(password);

  const validate = (): string | null => {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) return "Name must be at least 2 characters";
    if (!/^[A-Za-z\s'-]+$/.test(trimmedName)) return "Name can only contain letters, spaces, hyphens, and apostrophes";
    if (strength.score < 2) return "Password is too weak — " + strength.hints[0];
    if (password !== confirmPassword) return "Passwords do not match";
    if (role === "swimmer") {
      const ageNum = parseInt(age, 10);
      if (!ageNum || ageNum < 5 || ageNum > 100) return "Please enter a valid age (5–100)";
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError(null);
    setLoading(true);
    try {
      const ageNum = role === "swimmer" ? parseInt(age, 10) : undefined;
      await signUp({
        name: name.trim(),
        email,
        password,
        role,
        age: ageNum,
        coachId: role === "swimmer" && coachId ? coachId : undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md">
      <h1 className="text-2xl font-display font-bold text-white mb-1">Create account</h1>
      <p className="text-sm text-slate-400 mb-6">Choose coach or swimmer.</p>

      <div className="flex gap-2 mb-6">
        {(["coach", "swimmer"] as UserRole[]).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => {
              setRole(r);
              if (r === "coach") { setCoachId(""); setAge(""); }
            }}
            className={cn(
              "flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-colors",
              role === r
                ? "bg-aqua-300/10 border-aqua-300/50 text-aqua-300"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Full name</label>
          <input
            type="text"
            required
            minLength={2}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Ahmed Amr"
            className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-aqua-300/50"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-aqua-300/50"
          />
        </div>

        {/* Password */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-aqua-300/50"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {/* Strength meter */}
          {password.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      strength.score >= i ? STRENGTH_COLOR[strength.score] : "bg-white/10"
                    )}
                  />
                ))}
              </div>
              <p className="text-xs text-slate-500">
                {STRENGTH_LABEL[strength.score]}{" "}
                {strength.hints.length > 0 && strength.score < 3 && (
                  <span className="text-slate-600">— {strength.hints[0]}</span>
                )}
              </p>
            </div>
          )}
        </div>

        {/* Confirm password */}
        <div>
          <label className="block text-xs text-slate-500 mb-1">Confirm password</label>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repeat password"
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 pr-10 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-aqua-300/50"
            />
            {confirmPassword.length > 0 && (
              <span className="absolute right-3 top-1/2 -translate-y-1/2">
                {password === confirmPassword
                  ? <CheckCircle className="w-4 h-4 text-emerald-400" />
                  : <XCircle className="w-4 h-4 text-rose-400" />}
              </span>
            )}
          </div>
        </div>

        {role === "swimmer" && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Age</label>
            <input
              type="number"
              required
              min={5}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
            />
          </div>
        )}

        {role === "swimmer" && (
          <div>
            <label className="block text-xs text-slate-500 mb-1">Coach (optional)</label>
            <select
              value={coachId}
              onChange={(e) => setCoachId(e.target.value)}
              disabled={coachesLoading}
              className="w-full bg-ocean-900/50 border border-white/10 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-aqua-300/50"
            >
              <option value="">No coach selected</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {!coachesLoading && coaches.length === 0 && (
              <p className="text-xs text-slate-500 mt-1">No coaches available yet.</p>
            )}
          </div>
        )}

        {error && <p className="text-sm text-rose-400">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-lg bg-aqua-500 hover:bg-aqua-400 text-ocean-950 font-medium text-sm transition-colors disabled:opacity-50"
        >
          {loading ? "Creating account..." : "Sign up"}
        </button>
      </form>

      <p className="mt-4 text-sm text-slate-500 text-center">
        Already have an account?{" "}
        <Link href="/login" className="text-aqua-300 hover:text-aqua-200">Sign in</Link>
      </p>
    </div>
  );
}
