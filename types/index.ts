/**
 * Core TypeScript interfaces for the SwimMate Analytics Platform
 * All data structures are strictly typed to ensure consistency across
 * the frontend, even with placeholder data.
 */

export interface Swimmer {
  id: string;
  name: string;
  age: number;
  team: string;
  strokeSpecialty: StrokeType;
  avatarUrl?: string;
  createdAt: string;
  totalSessions: number;
  averageQualityScore: number;
  lastSessionDate: string;
}

export type StrokeType = 
  | "Freestyle" 
  | "Backstroke" 
  | "Breaststroke" 
  | "Butterfly" 
  | "IM";

/** Primary strokes tracked on the dashboard */
export type TrackedStroke = "Freestyle" | "Breaststroke" | "Butterfly";

export interface StrokeQualityScore {
  strokeType: TrackedStroke;
  qualityScore: number;
  numStrokes?: number;
  lastSessionId?: string;
  lastSessionDate?: string;
}

export type AnalysisStatus = 
  | "pending" 
  | "processing" 
  | "completed" 
  | "failed";

export interface Session {
  id: string;
  swimmerId: string;
  swimmerName: string;
  date: string;
  duration: number; // in seconds
  distance: number; // in meters
  poolLength: number; // in meters
  status: AnalysisStatus;
  strokeType: StrokeType;
  qualityScore?: number;
  numStrokes?: number;
  createdAt: string;
  analyzedAt?: string;
}

export interface SensorData {
  timestamp: number;
  accelerometerX: number;
  accelerometerY: number;
  accelerometerZ: number;
  gyroscopeX: number;
  gyroscopeY: number;
  gyroscopeZ: number;
}

export interface StrokeSegment {
  startIndex: number;
  endIndex: number;
  strokeType: StrokeType;
  confidence: number;
}

export interface MLFeature {
  name: string;
  value: number; // 0-100
  category: "good" | "average" | "needs_improvement";
  weight: number; // importance weight in overall score
  unit?: string;
}

export interface MLResults {
  sessionId: string;
  strokeType: StrokeType;
  strokeTypeConfidence: number;
  overallQualityScore: number;
  numStrokes?: number;
  segments: StrokeSegment[];
  features: MLFeature[];
  sensorData: SensorData[];
  processingTime: number; // in ms
  pipelineVersion: string;
}

export interface HistoricalDataPoint {
  date: string;
  qualityScore: number;
  strokeType: StrokeType;
  sessionId: string;
}
