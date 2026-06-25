import type { AuthUser } from "@/types/auth";
import type { SessionFilters, SwimmerListOptions } from "@/services/types";

export function getSwimmerListOptions(user: AuthUser | null): SwimmerListOptions | undefined {
  if (!user) return undefined;
  if (user.role === "swimmer" && user.swimmerId) {
    return { swimmerId: user.swimmerId };
  }
  if (user.role === "coach" && user.coachId) {
    return { coachId: user.coachId };
  }
  return undefined;
}

export function getSessionFilters(user: AuthUser | null, swimmerId?: string): SessionFilters | undefined {
  if (swimmerId) {
    return { swimmerId };
  }
  if (!user) return undefined;
  if (user.role === "swimmer") {
    // BUG-05 fix: always return a restrictive filter for swimmers.
    // If swimmerId is missing (e.g. profile not yet created), fall back to
    // user.id which won't match any real session — guaranteeing an empty
    // result instead of leaking all sessions.
    return { swimmerId: user.swimmerId ?? user.id };
  }
  if (user.role === "coach") {
    return {};
  }
  return undefined;
}

export function canAccessSwimmer(
  user: AuthUser | null,
  swimmerId: string,
  assignedSwimmerIds?: string[]
): boolean {
  if (!user) return false;
  if (user.role === "swimmer") {
    return user.swimmerId === swimmerId;
  }
  if (user.role === "coach") {
    // BUG-02 fix: require an explicit assignment list and deny when absent
    // (fail-secure). The BFF already enforces this server-side; this guard
    // also enforces it client-side so UI redirects before any data renders.
    if (!assignedSwimmerIds) return false;
    return assignedSwimmerIds.includes(swimmerId);
  }
  return false;
}

export function homePathForRole(role: AuthUser["role"]): string {
  if (role === "admin") return "/admin";
  return role === "coach" ? "/coach" : "/swimmer";
}
