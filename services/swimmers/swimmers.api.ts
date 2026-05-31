import { apiGet, ServiceError } from "@/services/http-client";
import type { Swimmer } from "@/types";
import type { ISwimmerService, SwimmerListOptions } from "@/services/types";

function buildQuery(options?: SwimmerListOptions): string {
  const params = new URLSearchParams();
  if (options?.coachId) params.set("coachId", options.coachId);
  if (options?.swimmerId) params.set("swimmerId", options.swimmerId);
  const q = params.toString();
  return q ? `?${q}` : "";
}

export const swimmersApiService: ISwimmerService = {
  async listSwimmers(options) {
    return apiGet<Swimmer[]>(`/api/swimmers${buildQuery(options)}`);
  },

  async getSwimmer(id: string) {
    try {
      return await apiGet<Swimmer>(`/api/swimmers/${id}`);
    } catch (err) {
      if (err instanceof ServiceError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
