import { getDataProvider } from "@/services/config";
import type { IAuthService } from "./auth.types";
import { authApiService } from "./auth.api";
import { authMockService } from "./auth.mock";

export function getAuthService(): IAuthService {
  return getDataProvider() === "api" ? authApiService : authMockService;
}
