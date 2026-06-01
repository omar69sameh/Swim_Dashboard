import { apiGet } from "@/services/http-client";
import type { CoachOption } from "@/lib/supabase/database.types";
import type { ICoachesService } from "./coaches.types";

export const coachesApiService: ICoachesService = {
  async listCoaches() {
    return apiGet<CoachOption[]>("/api/coaches");
  },
};
