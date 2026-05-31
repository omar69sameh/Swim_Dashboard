export type UserRole = "coach" | "swimmer";

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
}

export interface SignInInput {
  email: string;
  password: string;
}
