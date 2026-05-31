import { teamMetrics } from "@/lib/data";
import type { ITeamMetricsService } from "@/services/types";

export const teamMetricsMockService: ITeamMetricsService = {
  async getTeamMetrics() {
    return teamMetrics;
  },
};
