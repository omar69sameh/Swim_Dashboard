import { apiGet, apiPost, apiPatch, apiDelete, bustApiCache } from "@/services/http-client";
import type { IAdminUserService, AdminUser, CreateUserInput, UpdateUserInput } from "./admin.types";

const USERS_PATH = "/api/admin/users";

export const adminApiService: IAdminUserService = {
  async listUsers(): Promise<AdminUser[]> {
    const data = await apiGet<{ users: AdminUser[] }>(USERS_PATH, true);
    return data.users;
  },

  async createUser(input: CreateUserInput): Promise<{ userId: string }> {
    const result = await apiPost<{ userId: string }>(USERS_PATH, input);
    bustApiCache(USERS_PATH);
    return result;
  },

  async updateUser(id: string, input: UpdateUserInput): Promise<void> {
    await apiPatch(`${USERS_PATH}/${id}`, input);
    bustApiCache(USERS_PATH);
  },

  async deleteUser(id: string): Promise<void> {
    await apiDelete(`${USERS_PATH}/${id}`);
    bustApiCache(USERS_PATH);
  },
};
