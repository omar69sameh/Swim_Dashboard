export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: "swimmer" | "coach" | "admin";
  age: number | null;
  coachId: string | null;
  sessionCount: number;
  createdAt: string;
  lastSignIn: string | null;
  confirmed: boolean;
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: "swimmer" | "coach" | "admin";
  age?: number;
  coachId?: string;
}

export interface UpdateUserInput {
  name?: string;
  role?: "swimmer" | "coach" | "admin";
  age?: number | null;
  coachId?: string | null;
}

export interface IAdminUserService {
  listUsers(): Promise<AdminUser[]>;
  createUser(input: CreateUserInput): Promise<{ userId: string }>;
  updateUser(id: string, input: UpdateUserInput): Promise<void>;
  deleteUser(id: string): Promise<void>;
}
