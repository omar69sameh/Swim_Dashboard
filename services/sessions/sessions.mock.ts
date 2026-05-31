import { sessions } from "@/lib/data";
import type { ISessionService } from "@/services/types";

export const sessionsMockService: ISessionService = {
  async listSessions(filters) {
    let result = sessions;
    if (filters?.swimmerId) {
      result = result.filter((s) => s.swimmerId === filters.swimmerId);
    } else if (filters?.swimmerIds?.length) {
      result = result.filter((s) => filters.swimmerIds!.includes(s.swimmerId));
    }
    return result.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  },

  async getSession(id: string) {
    return sessions.find((s) => s.id === id) ?? null;
  },
};
