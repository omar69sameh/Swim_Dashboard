import { getDataProvider } from "@/services/config";
import type { ITeamMetricsService } from "@/services/types";
import { teamMetricsApiService } from "./team-metrics.api";
import { teamMetricsMockService } from "./team-metrics.mock";

export function getTeamMetricsService(): ITeamMetricsService {
  return getDataProvider() === "api" ? teamMetricsApiService : teamMetricsMockService;
}
