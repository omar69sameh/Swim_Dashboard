export { getAuthService } from "./auth/auth.service";
export { getAdminUserService } from "./admin/admin.service";
export type { IAdminUserService, AdminUser, CreateUserInput, UpdateUserInput } from "./admin/admin.types";
export { getSwimmerService } from "./swimmers/swimmers.service";
export { getSessionService } from "./sessions/sessions.service";
export { getMLAnalysisService } from "./ml-analysis/ml-analysis.service";
export { getHistoricalDataService } from "./historical/historical.service";
export { getCoachesService } from "./coaches/coaches.service";
export { getDataProvider } from "./config";
export type {
  ISwimmerService,
  ISessionService,
  IMLAnalysisService,
  IHistoricalDataService,
  SessionFilters,
  SwimmerListOptions,
} from "./types";
export type { IAuthService } from "./auth/auth.types";
export { ServiceError } from "./http-client";
