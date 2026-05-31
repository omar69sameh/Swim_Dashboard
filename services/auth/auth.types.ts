import type { AuthUser, SignInInput, SignUpInput } from "@/types/auth";

export interface IAuthService {
  getSession(): Promise<AuthUser | null>;
  signIn(input: SignInInput): Promise<AuthUser>;
  signUp(input: SignUpInput): Promise<AuthUser>;
  signOut(): Promise<void>;
}
