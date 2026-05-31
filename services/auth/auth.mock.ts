import {
  mockSignIn,
  mockSignUp,
  readStoredSession,
  writeStoredSession,
} from "@/lib/mock-auth";
import type { IAuthService } from "./auth.types";

export const authMockService: IAuthService = {
  async getSession() {
    return readStoredSession();
  },

  async signIn(input) {
    const user = mockSignIn(input.email, input.password);
    if (!user) {
      throw new Error("Invalid email or password");
    }
    writeStoredSession(user);
    return user;
  },

  async signUp(input) {
    const user = mockSignUp(input);
    writeStoredSession(user);
    return user;
  },

  async signOut() {
    writeStoredSession(null);
  },
};
