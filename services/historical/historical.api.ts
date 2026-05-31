import { apiGet } from "@/services/http-client";
import type { HistoricalDataPoint } from "@/types";
import type { IHistoricalDataService } from "@/services/types";

export const historicalApiService: IHistoricalDataService = {
  async getHistory(swimmerId: string) {
    return apiGet<HistoricalDataPoint[]>(`/api/swimmers/${swimmerId}/history`);
  },
};
