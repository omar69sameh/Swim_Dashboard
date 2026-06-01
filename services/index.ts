export { getAuthService } from "./auth/auth.service";
export { getSwimmerService } from "./swimmers/swimmers.service";
export { getSessionService } from "./sessions/sessions.service";
export { getMLAnalysisService } from "./ml-analysis/ml-analysis.service";
export { getTeamMetricsService } from "./team-metrics/team-metrics.service";
export { getHistoricalDataService } from "./historical/historical.service";
export { getCoachesService } from "./coaches/coaches.service";
export { getDataProvider } from "./config";
export type {
  ISwimmerService,
  ISessionService,
  IMLAnalysisService,
  ITeamMetricsService,
  IHistoricalDataService,
  SessionFilters,
  SwimmerListOptions,
} from "./types";
export type { IAuthService } from "./auth/auth.types";
export { ServiceError } from "./http-client";
