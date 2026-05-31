import { getDataProvider } from "@/services/config";
import type { ISessionService } from "@/services/types";
import { sessionsApiService } from "./sessions.api";
import { sessionsMockService } from "./sessions.mock";

export function getSessionService(): ISessionService {
  return getDataProvider() === "api" ? sessionsApiService : sessionsMockService;
}
