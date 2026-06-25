import { createSupabaseServerClient } from "./server";
import { toAuthUser } from "./auth-user";
import { ensureProfileForUser } from "./ensure-profile";
import type { AuthUser } from "@/types/auth";
import { isSupabaseConfigured } from "./env";
import { MOCK_COOKIE_NAME } from "@/lib/mock-auth";
import { cookies } from "next/headers";

// supabase.auth.getUser() makes a network round-trip to Supabase's auth server
// on every API call. Caching by access token eliminates that overhead.
const authCache = new Map<string, { user: AuthUser; expiresAt: number }>();
const AUTH_CACHE_TTL_MS = 30_000;

function extractAccessToken(all: { name: string; value: string }[]): string | null {
  for (const { name, value } of all) {
    if (/sb-.+-auth-token$/.test(name)) {
      try {
        const parsed = JSON.parse(decodeURIComponent(value));
        if (typeof parsed?.access_token === "string") return parsed.access_token;
      } catch { /* chunked or malformed cookie — fall through */ }
    }
  }
  return null;
}

export function invalidateAuthCache() {
  authCache.clear();
}

export async function getAuthUserFromRequest(): Promise<AuthUser | null> {
  if (!isSupabaseConfigured()) {
    // In mock mode there is no JWT. Read the identity from the browser cookie
    // that writeMockCookie() sets on sign-in so API routes can enforce RBAC.
    const cookieStore = await cookies();
    const raw = cookieStore.get(MOCK_COOKIE_NAME)?.value;
    if (!raw) return null;
    try {
      return JSON.parse(decodeURIComponent(raw)) as AuthUser;
    } catch {
      return null;
    }
  }

  const cookieStore = await cookies();
  const token = extractAccessToken(cookieStore.getAll());

  if (token) {
    const cached = authCache.get(token);
    if (cached && cached.expiresAt > Date.now()) return cached.user;
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const profile = await ensureProfileForUser(user);
  const authUser = toAuthUser(user, profile);

  if (token && authUser) {
    authCache.set(token, { user: authUser, expiresAt: Date.now() + AUTH_CACHE_TTL_MS });
    // Prune expired entries if cache grows large
    if (authCache.size > 200) {
      const now = Date.now();
      for (const [k, v] of authCache) {
        if (v.expiresAt <= now) authCache.delete(k);
      }
    }
  }

  return authUser;
}
