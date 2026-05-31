import { getDataProvider } from "@/services/config";
import type { ISwimmerService } from "@/services/types";
import { swimmersApiService } from "./swimmers.api";
import { swimmersMockService } from "./swimmers.mock";

export function getSwimmerService(): ISwimmerService {
  return getDataProvider() === "api" ? swimmersApiService : swimmersMockService;
}
