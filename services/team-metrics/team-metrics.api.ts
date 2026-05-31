import { apiGet } from "@/services/http-client";
import type { TeamMetric } from "@/types";
import type { ITeamMetricsService } from "@/services/types";

export const teamMetricsApiService: ITeamMetricsService = {
  async getTeamMetrics() {
    return apiGet<TeamMetric[]>("/api/team-metrics");
  },
};
