import { apiGet } from "@/services/http-client";
import type { AuthUser, SignInInput, SignUpInput } from "@/types/auth";
import type { IAuthService } from "./auth.types";

export const authApiService: IAuthService = {
  async getSession() {
    try {
      const res = await fetch("/api/auth/session", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return null;
      return (await res.json()) as AuthUser;
    } catch {
      return null;
    }
  },

  async signIn(input: SignInInput) {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Sign in failed");
    }
    return res.json() as Promise<AuthUser>;
  },

  async signUp(input: SignUpInput) {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? "Sign up failed");
    }
    return res.json() as Promise<AuthUser>;
  },

  async signOut() {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  },
};
