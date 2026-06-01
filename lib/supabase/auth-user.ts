import type { User } from "@supabase/supabase-js";
import type { AuthUser, UserRole } from "@/types/auth";
import type { ProfileRow } from "./database.types";

function displayName(profile: ProfileRow | null, metadata: Record<string, unknown>, email: string): string {
  if (profile?.first_name || profile?.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(" ").trim();
  }
  const metaName = metadata.name;
  if (typeof metaName === "string" && metaName.trim()) return metaName.trim();
  return email.split("@")[0] ?? "User";
}

function roleFromProfileAndMetadata(
  profile: ProfileRow | null,
  metadata: Record<string, unknown>
): UserRole {
  if (profile?.role === "coach" || profile?.role === "swimmer") {
    return profile.role;
  }
  return metadata.role === "coach" ? "coach" : "swimmer";
}

export function toAuthUser(user: User, profile: ProfileRow | null): AuthUser {
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const role = roleFromProfileAndMetadata(profile, metadata);
  const name = displayName(profile, metadata, user.email ?? "");

  const authUser: AuthUser = {
    id: user.id,
    email: user.email ?? "",
    name,
    role,
  };

  if (role === "coach") {
    authUser.coachId = user.id;
  } else {
    authUser.swimmerId = user.id;
  }

  return authUser;
}
