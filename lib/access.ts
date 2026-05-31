import { getSwimmerIdsForCoach } from "@/lib/mock-auth";
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
  if (user.role === "swimmer" && user.swimmerId) {
    return { swimmerId: user.swimmerId };
  }
  if (user.role === "coach" && user.coachId) {
    const ids = getSwimmerIdsForCoach(user.coachId);
    return { swimmerIds: ids };
  }
  return undefined;
}

export function canAccessSwimmer(user: AuthUser | null, swimmerId: string): boolean {
  if (!user) return false;
  if (user.role === "swimmer") {
    return user.swimmerId === swimmerId;
  }
  if (user.role === "coach" && user.coachId) {
    return getSwimmerIdsForCoach(user.coachId).includes(swimmerId);
  }
  return false;
}

export function homePathForRole(role: AuthUser["role"]): string {
  return role === "coach" ? "/coach" : "/swimmer";
}
