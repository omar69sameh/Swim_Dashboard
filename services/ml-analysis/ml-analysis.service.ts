import { getDataProvider } from "@/services/config";
import type { IMLAnalysisService } from "@/services/types";
import { mlAnalysisApiService } from "./ml-analysis.api";
import { mlAnalysisMockService } from "./ml-analysis.mock";

export function getMLAnalysisService(): IMLAnalysisService {
  return getDataProvider() === "api" ? mlAnalysisApiService : mlAnalysisMockService;
}
