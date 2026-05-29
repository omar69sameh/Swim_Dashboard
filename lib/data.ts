/**
 * Realistic placeholder data for the SwimML Analytics Dashboard.
 * This simulates the data that would normally come from Supabase + ML API.
 * All values are calibrated to realistic swimming performance metrics.
 */

import { Swimmer, Session, MLResults, SensorData, HistoricalDataPoint } from "@/types";

export const swimmers: Swimmer[] = [
  {
    id: "sw-001",
    name: "Sarah Chen",
    age: 22,
    team: "Aqua Elite",
    strokeSpecialty: "Butterfly",
    totalSessions: 47,
    averageQualityScore: 87.3,
    lastSessionDate: "2024-05-28",
    createdAt: "2023-09-01",
  },
  {
    id: "sw-002",
    name: "Marcus Johnson",
    age: 19,
    team: "Aqua Elite",
    strokeSpecialty: "Freestyle",
    totalSessions: 52,
    averageQualityScore: 91.5,
    lastSessionDate: "2024-05-27",
    createdAt: "2023-09-01",
  },
  {
    id: "sw-003",
    name: "Elena Rodriguez",
    age: 24,
    team: "Aqua Elite",
    strokeSpecialty: "Backstroke",
    totalSessions: 38,
    averageQualityScore: 84.7,
    lastSessionDate: "2024-05-26",
    createdAt: "2023-09-15",
  },
  {
    id: "sw-004",
    name: "David Park",
    age: 20,
    team: "Aqua Elite",
    strokeSpecialty: "Breaststroke",
    totalSessions: 41,
    averageQualityScore: 89.1,
    lastSessionDate: "2024-05-25",
    createdAt: "2023-10-01",
  },
  {
    id: "sw-005",
    name: "Aisha Patel",
    age: 21,
    team: "Aqua Elite",
    strokeSpecialty: "IM",
    totalSessions: 35,
    averageQualityScore: 86.2,
    lastSessionDate: "2024-05-24",
    createdAt: "2023-10-15",
  },
];

export const sessions: Session[] = [
  {
    id: "ses-001",
    swimmerId: "sw-001",
    swimmerName: "Sarah Chen",
    date: "2024-05-28",
    duration: 1860,
    distance: 2000,
    poolLength: 50,
    status: "completed",
    strokeType: "Butterfly",
    qualityScore: 92.4,
    createdAt: "2024-05-28T08:30:00Z",
    analyzedAt: "2024-05-28T08:45:00Z",
  },
  {
    id: "ses-002",
    swimmerId: "sw-002",
    swimmerName: "Marcus Johnson",
    date: "2024-05-27",
    duration: 2400,
    distance: 3000,
    poolLength: 50,
    status: "completed",
    strokeType: "Freestyle",
    qualityScore: 88.7,
    createdAt: "2024-05-27T07:15:00Z",
    analyzedAt: "2024-05-27T07:35:00Z",
  },
  {
    id: "ses-003",
    swimmerId: "sw-003",
    swimmerName: "Elena Rodriguez",
    date: "2024-05-26",
    duration: 1500,
    distance: 1500,
    poolLength: 25,
    status: "completed",
    strokeType: "Backstroke",
    qualityScore: 85.3,
    createdAt: "2024-05-26T09:00:00Z",
    analyzedAt: "2024-05-26T09:18:00Z",
  },
  {
    id: "ses-004",
    swimmerId: "sw-001",
    swimmerName: "Sarah Chen",
    date: "2024-05-25",
    duration: 2100,
    distance: 2200,
    poolLength: 50,
    status: "completed",
    strokeType: "Butterfly",
    qualityScore: 90.1,
    createdAt: "2024-05-25T08:00:00Z",
    analyzedAt: "2024-05-25T08:20:00Z",
  },
  {
    id: "ses-005",
    swimmerId: "sw-004",
    swimmerName: "David Park",
    date: "2024-05-25",
    duration: 1800,
    distance: 1800,
    poolLength: 25,
    status: "completed",
    strokeType: "Breaststroke",
    qualityScore: 91.2,
    createdAt: "2024-05-25T10:00:00Z",
    analyzedAt: "2024-05-25T10:22:00Z",
  },
  {
    id: "ses-006",
    swimmerId: "sw-005",
    swimmerName: "Aisha Patel",
    date: "2024-05-24",
    duration: 2700,
    distance: 3200,
    poolLength: 50,
    status: "completed",
    strokeType: "IM",
    qualityScore: 87.5,
    createdAt: "2024-05-24T07:45:00Z",
    analyzedAt: "2024-05-24T08:10:00Z",
  },
  {
    id: "ses-007",
    swimmerId: "sw-002",
    swimmerName: "Marcus Johnson",
    date: "2024-05-24",
    duration: 1950,
    distance: 2500,
    poolLength: 50,
    status: "processing",
    strokeType: "Freestyle",
    createdAt: "2024-05-24T14:00:00Z",
  },
  {
    id: "ses-008",
    swimmerId: "sw-003",
    swimmerName: "Elena Rodriguez",
    date: "2024-05-23",
    duration: 1200,
    distance: 1200,
    poolLength: 25,
    status: "pending",
    strokeType: "Backstroke",
    createdAt: "2024-05-23T16:30:00Z",
  },
];

/**
 * Generate realistic sensor data with periodic stroke patterns.
 * Simulates accelerometer and gyroscope readings at 50Hz.
 */
export function generateSensorData(duration: number = 60): SensorData[] {
  const data: SensorData[] = [];
  const sampleRate = 50; // 50Hz
  const totalSamples = duration * sampleRate;
  const strokePeriod = 2.0; // seconds per stroke (butterfly)

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const phase = (t % strokePeriod) / strokePeriod;

    // Simulate butterfly stroke pattern
    // Entry: arms forward, dolphin kick
    // Pull: powerful underwater pull
    // Recovery: arms sweep forward above water

    const entryPhase = Math.sin(phase * Math.PI * 2) * 0.3;
    const pullPhase = Math.sin((phase + 0.3) * Math.PI * 2) * 0.8;
    const kickPhase = Math.sin((phase + 0.5) * Math.PI * 4) * 0.4;

    // Add noise
    const noise = () => (Math.random() - 0.5) * 0.1;

    data.push({
      timestamp: t,
      accelerometerX: entryPhase + noise(),
      accelerometerY: pullPhase + noise(),
      accelerometerZ: kickPhase + noise() + 1.0, // gravity offset
      gyroscopeX: kickPhase * 2 + noise(),
      gyroscopeY: entryPhase * 1.5 + noise(),
      gyroscopeZ: pullPhase * 0.5 + noise(),
    });
  }

  return data;
}

/**
 * Generate ML analysis results for a session.
 * Uses deterministic seeding based on session ID for consistency.
 */
export function generateMLResults(sessionId: string): MLResults {
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) throw new Error(`Session ${sessionId} not found`);

  const sensorData = generateSensorData(session.duration);

  // Generate stroke segments (every ~2 seconds for butterfly)
  const segments = [];
  const segmentDuration = 2.0;
  const numSegments = Math.floor(session.duration / segmentDuration);

  for (let i = 0; i < numSegments; i++) {
    const startIdx = Math.floor(i * segmentDuration * 50);
    const endIdx = Math.floor((i + 1) * segmentDuration * 50);
    segments.push({
      startIndex: startIdx,
      endIndex: Math.min(endIdx, sensorData.length - 1),
      strokeType: session.strokeType,
      confidence: 85 + Math.random() * 14, // 85-99%
    });
  }

  // Features based on stroke type
  const featureConfigs: Record<string, { name: string; weight: number; unit?: string }[]> = {
    Butterfly: [
      { name: "Dolphin Kick Power", weight: 0.25, unit: "N" },
      { name: "Arm Recovery Speed", weight: 0.20, unit: "m/s" },
      { name: "Body Undulation", weight: 0.20, unit: "°" },
      { name: "Entry Angle", weight: 0.15, unit: "°" },
      { name: "Breath Timing", weight: 0.10, unit: "s" },
      { name: "Turn Efficiency", weight: 0.10, unit: "%" },
    ],
    Freestyle: [
      { name: "Stroke Rate", weight: 0.25, unit: "spm" },
      { name: "Distance Per Stroke", weight: 0.25, unit: "m" },
      { name: "Body Rotation", weight: 0.20, unit: "°" },
      { name: "Catch Efficiency", weight: 0.15, unit: "%" },
      { name: "Kick Propulsion", weight: 0.10, unit: "N" },
      { name: "Streamline", weight: 0.05, unit: "%" },
    ],
    Backstroke: [
      { name: "Stroke Rate", weight: 0.25, unit: "spm" },
      { name: "Body Rotation", weight: 0.25, unit: "°" },
      { name: "Kick Depth", weight: 0.20, unit: "m" },
      { name: "Entry Cleanliness", weight: 0.15, unit: "%" },
      { name: "Shoulder Roll", weight: 0.10, unit: "°" },
      { name: "Turn Speed", weight: 0.05, unit: "s" },
    ],
    Breaststroke: [
      { name: "Kick Velocity", weight: 0.30, unit: "m/s" },
      { name: "Arm Extension", weight: 0.25, unit: "m" },
      { name: "Glide Efficiency", weight: 0.20, unit: "%" },
      { name: "Pull Timing", weight: 0.15, unit: "s" },
      { name: "Breath Control", weight: 0.05, unit: "%" },
      { name: "Turn Push-off", weight: 0.05, unit: "N" },
    ],
    IM: [
      { name: "Transition Speed", weight: 0.30, unit: "s" },
      { name: "Stroke Balance", weight: 0.25, unit: "%" },
      { name: "Turn Consistency", weight: 0.20, unit: "%" },
      { name: "Pacing Strategy", weight: 0.15, unit: "%" },
      { name: "Energy Distribution", weight: 0.10, unit: "%" },
    ],
  };

  const configs = featureConfigs[session.strokeType] || featureConfigs["Freestyle"];

  const features = configs.map((config) => {
    const value = 65 + Math.random() * 30; // 65-95 range
    let category: "good" | "average" | "needs_improvement" = "average";
    if (value >= 85) category = "good";
    else if (value < 75) category = "needs_improvement";

    return {
      name: config.name,
      value: Math.round(value * 10) / 10,
      category,
      weight: config.weight,
      unit: config.unit,
    };
  });

  // Calculate weighted quality score
  const overallScore = features.reduce((sum, f) => sum + f.value * f.weight, 0);

  return {
    sessionId,
    strokeType: session.strokeType,
    strokeTypeConfidence: 92 + Math.random() * 7,
    overallQualityScore: Math.round(overallScore * 10) / 10,
    segments,
    features,
    sensorData,
    processingTime: 1200 + Math.random() * 3000,
    pipelineVersion: "v2.4.1",
  };
}

/**
 * Generate historical performance data for a swimmer.
 */
export function generateHistoricalData(swimmerId: string): HistoricalDataPoint[] {
  const swimmer = swimmers.find((s) => s.id === swimmerId);
  if (!swimmer) return [];

  const data: HistoricalDataPoint[] = [];
  const baseScore = swimmer.averageQualityScore;

  for (let i = 30; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);

    // Add some realistic variation
    const variation = (Math.random() - 0.5) * 10;
    const trend = i * 0.1; // slight improvement over time

    data.push({
      date: date.toISOString().split("T")[0],
      qualityScore: Math.round((baseScore + variation - trend) * 10) / 10,
      strokeType: swimmer.strokeSpecialty,
      sessionId: `ses-hist-${i}`,
    });
  }

  return data;
}

export const teamMetrics = [
  { label: "Total Swimmers", value: 5, change: 0, trend: "neutral" as const, icon: "Users" },
  { label: "Avg Quality Score", value: "87.8", change: 3.2, trend: "up" as const, icon: "TrendingUp" },
  { label: "Pipeline Success", value: "98.5%", change: 1.2, trend: "up" as const, icon: "Zap" },
  { label: "Sessions This Week", value: 12, change: -2, trend: "down" as const, icon: "Activity" },
];
