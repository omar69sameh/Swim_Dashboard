export type UserRole = "coach" | "swimmer" | "admin";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  swimmerId?: string;
  coachId?: string;
}

export interface SignUpInput {
  email: string;
  password: string;
  name: string;
  role: UserRole;
  /** Swimmer signup — stored on profiles.age */
  age?: number;
  /** Optional — links swimmer to a coach's roster */
  coachId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  age: number | null;
  role: UserRole;
  coachId: string | null;
  coachName: string | null;
}

export interface SignInInput {
  email: string;
  password: string;
}
