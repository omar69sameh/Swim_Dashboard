import type {
  Swimmer,
  Session,
  MLResults,
  TeamMetric,
  HistoricalDataPoint,
} from "@/types";

export interface SessionFilters {
  swimmerId?: string;
  swimmerIds?: string[];
}

export interface SwimmerListOptions {
  coachId?: string;
  swimmerId?: string;
}

export interface ISwimmerService {
  listSwimmers(options?: SwimmerListOptions): Promise<Swimmer[]>;
  getSwimmer(id: string): Promise<Swimmer | null>;
}

export interface ISessionService {
  listSessions(filters?: SessionFilters): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
}

export interface IMLAnalysisService {
  getResults(sessionId: string): Promise<MLResults>;
}

export interface ITeamMetricsService {
  getTeamMetrics(): Promise<TeamMetric[]>;
}

export interface IHistoricalDataService {
  getHistory(swimmerId: string): Promise<HistoricalDataPoint[]>;
}
