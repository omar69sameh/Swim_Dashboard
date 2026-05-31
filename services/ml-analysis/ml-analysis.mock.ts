import { generateMLResults } from "@/lib/data";
import type { IMLAnalysisService } from "@/services/types";

export const mlAnalysisMockService: IMLAnalysisService = {
  async getResults(sessionId: string) {
    return generateMLResults(sessionId, { lite: true });
  },
};
