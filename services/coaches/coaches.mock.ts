import type { ICoachesService } from "./coaches.types";

export const coachesMockService: ICoachesService = {
  async listCoaches() {
    return [{ id: "coach-001", name: "Coach Williams" }];
  },
};
