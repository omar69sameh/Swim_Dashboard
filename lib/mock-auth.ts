import type { AuthUser, SignUpInput, UserRole } from "@/types/auth";

const STORAGE_KEY = "swimml_auth_session";

interface MockCredential {
  password: string;
  user: AuthUser;
}

/** Coach Williams — all demo swimmers assigned */
export const coachAssignments: Record<string, string[]> = {
  "coach-001": ["sw-001", "sw-002", "sw-003", "sw-004", "sw-005"],
};

const mockUsers: MockCredential[] = [
  {
    password: "coach123",
    user: {
      id: "coach-001",
      email: "coach@demo.com",
      name: "Coach Williams",
      role: "coach",
      coachId: "coach-001",
    },
  },
  {
    password: "swim123",
    user: {
      id: "user-sw-001",
      email: "sarah@demo.com",
      name: "Sarah Chen",
      role: "swimmer",
      swimmerId: "sw-001",
    },
  },
  {
    password: "swim123",
    user: {
      id: "user-sw-002",
      email: "marcus@demo.com",
      name: "Marcus Johnson",
      role: "swimmer",
      swimmerId: "sw-002",
    },
  },
];

const dynamicUsers: MockCredential[] = [];

export function getSwimmerIdsForCoach(coachId: string): string[] {
  return coachAssignments[coachId] ?? [];
}

export function readStoredSession(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function writeStoredSession(user: AuthUser | null): void {
  if (typeof window === "undefined") return;
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export function mockSignIn(email: string, password: string): AuthUser | null {
  const normalized = email.trim().toLowerCase();
  const all = [...mockUsers, ...dynamicUsers];
  const match = all.find(
    (u) => u.user.email.toLowerCase() === normalized && u.password === password
  );
  return match ? { ...match.user } : null;
}

export function mockSignUp(input: SignUpInput): AuthUser {
  const email = input.email.trim().toLowerCase();
  const exists = [...mockUsers, ...dynamicUsers].some(
    (u) => u.user.email.toLowerCase() === email
  );
  if (exists) {
    throw new Error("An account with this email already exists");
  }

  const id = `user-${Date.now()}`;
  const user: AuthUser = {
    id,
    email,
    name: input.name.trim(),
    role: input.role,
  };

  if (input.role === "coach") {
    const coachId = `coach-${Date.now()}`;
    user.coachId = coachId;
    coachAssignments[coachId] = [];
  } else {
    const swimmerId = `sw-new-${Date.now()}`;
    user.swimmerId = swimmerId;
    if (input.coachId && coachAssignments[input.coachId]) {
      coachAssignments[input.coachId].push(swimmerId);
    }
  }

  dynamicUsers.push({ password: input.password, user });
  return { ...user };
}

export function getDemoAccounts(): { email: string; password: string; role: UserRole }[] {
  return [
    { email: "coach@demo.com", password: "coach123", role: "coach" },
    { email: "sarah@demo.com", password: "swim123", role: "swimmer" },
    { email: "marcus@demo.com", password: "swim123", role: "swimmer" },
  ];
}
