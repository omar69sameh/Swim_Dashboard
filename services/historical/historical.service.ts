import { getDataProvider } from "@/services/config";
import type { IHistoricalDataService } from "@/services/types";
import { historicalApiService } from "./historical.api";
import { historicalMockService } from "./historical.mock";

export function getHistoricalDataService(): IHistoricalDataService {
  return getDataProvider() === "api" ? historicalApiService : historicalMockService;
}
