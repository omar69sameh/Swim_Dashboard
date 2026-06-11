import type { IAdminUserService } from "./admin.types";
import { adminApiService } from "./admin.api";

export function getAdminUserService(): IAdminUserService {
  return adminApiService;
}
