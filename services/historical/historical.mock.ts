import { generateHistoricalData } from "@/lib/data";
import type { IHistoricalDataService } from "@/services/types";

export const historicalMockService: IHistoricalDataService = {
  async getHistory(swimmerId: string) {
    return generateHistoricalData(swimmerId);
  },
};
