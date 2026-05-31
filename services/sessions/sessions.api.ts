import { apiGet, ServiceError } from "@/services/http-client";
import type { Session } from "@/types";
import type { ISessionService, SessionFilters } from "@/services/types";

function buildQuery(filters?: SessionFilters): string {
  const params = new URLSearchParams();
  if (filters?.swimmerId) params.set("swimmerId", filters.swimmerId);
  if (filters?.swimmerIds?.length) {
    params.set("swimmerIds", filters.swimmerIds.join(","));
  }
  const q = params.toString();
  return q ? `?${q}` : "";
}

export const sessionsApiService: ISessionService = {
  async listSessions(filters) {
    return apiGet<Session[]>(`/api/sessions${buildQuery(filters)}`);
  },

  async getSession(id: string) {
    try {
      return await apiGet<Session>(`/api/sessions/${id}`);
    } catch (err) {
      if (err instanceof ServiceError && err.status === 404) {
        return null;
      }
      throw err;
    }
  },
};
