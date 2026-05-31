import { swimmers } from "@/lib/data";
import { getSwimmerIdsForCoach } from "@/lib/mock-auth";
import type { ISwimmerService, SwimmerListOptions } from "@/services/types";

function filterSwimmers(options?: SwimmerListOptions) {
  if (options?.swimmerId) {
    const one = swimmers.find((s) => s.id === options.swimmerId);
    return one ? [one] : [];
  }
  if (options?.coachId) {
    const ids = getSwimmerIdsForCoach(options.coachId);
    return swimmers.filter((s) => ids.includes(s.id));
  }
  return swimmers;
}

export const swimmersMockService: ISwimmerService = {
  async listSwimmers(options) {
    return filterSwimmers(options);
  },

  async getSwimmer(id: string) {
    return swimmers.find((s) => s.id === id) ?? null;
  },
};
