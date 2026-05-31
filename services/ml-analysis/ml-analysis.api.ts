import { apiGet } from "@/services/http-client";
import type { MLResults } from "@/types";
import type { IMLAnalysisService } from "@/services/types";

export const mlAnalysisApiService: IMLAnalysisService = {
  async getResults(sessionId: string) {
    return apiGet<MLResults>(`/api/sessions/${sessionId}/ml-results`);
  },
};
