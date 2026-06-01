import type { CoachOption } from "@/lib/supabase/database.types";

export interface ICoachesService {
  listCoaches(): Promise<CoachOption[]>;
}
