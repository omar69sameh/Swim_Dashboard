import { getDataProvider } from "@/services/config";
import type { ICoachesService } from "./coaches.types";
import { coachesApiService } from "./coaches.api";
import { coachesMockService } from "./coaches.mock";

export function getCoachesService(): ICoachesService {
  return getDataProvider() === "api" ? coachesApiService : coachesMockService;
}
