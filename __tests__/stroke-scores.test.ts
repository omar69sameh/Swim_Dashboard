import {
  getStrokeScoresForSwimmer,
  getPersonalBestPerStroke,
  getMonthlyStrokeStats,
  getLastSessionForSwimmer,
  TRACKED_STROKES,
} from "@/lib/stroke-scores";
import type { Session } from "@/types";

const BASE_SESSION: Session = {
  id: "s1",
  swimmerId: "swimmer1",
  swimmerName: "Test Swimmer",
  date: "2025-06-01",
  duration: 120,
  distance: 100,
  poolLength: 50,
  strokeType: "Freestyle",
  status: "completed",
  qualityScore: 80,
  qualityTier: "low",
  qualityLabel: "good",
  numStrokes: 30,
  createdAt: "2025-06-01T00:00:00Z",
};

function makeSession(overrides: Partial<Session>): Session {
  return { ...BASE_SESSION, ...overrides };
}

describe("TRACKED_STROKES", () => {
  test("UT-26: contains Freestyle, Breaststroke, Butterfly", () => {
    expect(TRACKED_STROKES).toContain("Freestyle");
    expect(TRACKED_STROKES).toContain("Breaststroke");
    expect(TRACKED_STROKES).toContain("Butterfly");
    expect(TRACKED_STROKES).toHaveLength(3);
  });
});

describe("getStrokeScoresForSwimmer", () => {
  test("UT-27: returns latest score per tracked stroke", () => {
    const sessions: Session[] = [
      makeSession({ id: "s1", strokeType: "Freestyle", qualityScore: 70, date: "2025-06-01" }),
      makeSession({ id: "s2", strokeType: "Freestyle", qualityScore: 85, date: "2025-06-10" }),
      makeSession({ id: "s3", strokeType: "Breaststroke", qualityScore: 60, date: "2025-06-05" }),
    ];
    const scores = getStrokeScoresForSwimmer("swimmer1", sessions);
    const freestyle = scores.find((s) => s.strokeType === "Freestyle");
    expect(freestyle?.qualityScore).toBe(85); // latest, not highest
  });

  test("UT-28: returns 0 score for stroke with no sessions", () => {
    const sessions: Session[] = [
      makeSession({ strokeType: "Freestyle", qualityScore: 75 }),
    ];
    const scores = getStrokeScoresForSwimmer("swimmer1", sessions);
    const butterfly = scores.find((s) => s.strokeType === "Butterfly");
    expect(butterfly?.qualityScore).toBe(0);
  });

  test("UT-29: ignores pending sessions", () => {
    const sessions: Session[] = [
      makeSession({ status: "pending", strokeType: "Freestyle", qualityScore: 90 }),
    ];
    const scores = getStrokeScoresForSwimmer("swimmer1", sessions);
    const freestyle = scores.find((s) => s.strokeType === "Freestyle");
    expect(freestyle?.qualityScore).toBe(0);
  });

  test("UT-30: ignores sessions belonging to other swimmers", () => {
    const sessions: Session[] = [
      makeSession({ swimmerId: "other", strokeType: "Freestyle", qualityScore: 90 }),
    ];
    const scores = getStrokeScoresForSwimmer("swimmer1", sessions);
    const freestyle = scores.find((s) => s.strokeType === "Freestyle");
    expect(freestyle?.qualityScore).toBe(0);
  });

  test("UT-31: returns entry for all 3 tracked strokes even when empty", () => {
    const scores = getStrokeScoresForSwimmer("swimmer1", []);
    expect(scores).toHaveLength(3);
  });
});

describe("getPersonalBestPerStroke", () => {
  test("UT-32: returns highest quality score per stroke", () => {
    const sessions: Session[] = [
      makeSession({ id: "s1", strokeType: "Freestyle", qualityScore: 70, date: "2025-05-01" }),
      makeSession({ id: "s2", strokeType: "Freestyle", qualityScore: 92, date: "2025-06-01" }),
      makeSession({ id: "s3", strokeType: "Freestyle", qualityScore: 80, date: "2025-07-01" }),
    ];
    const bests = getPersonalBestPerStroke("swimmer1", sessions);
    const freestyle = bests.find((b) => b.strokeType === "Freestyle");
    expect(freestyle?.qualityScore).toBe(92);
  });

  test("UT-33: excludes strokes with no sessions", () => {
    const sessions: Session[] = [
      makeSession({ strokeType: "Freestyle", qualityScore: 75 }),
    ];
    const bests = getPersonalBestPerStroke("swimmer1", sessions);
    expect(bests.every((b) => b.strokeType === "Freestyle")).toBe(true);
    expect(bests).toHaveLength(1);
  });

  test("UT-34: returns empty array when no sessions", () => {
    const bests = getPersonalBestPerStroke("swimmer1", []);
    expect(bests).toHaveLength(0);
  });

  test("UT-35: ignores sessions with null qualityScore", () => {
    const sessions: Session[] = [
      makeSession({ strokeType: "Freestyle", qualityScore: null as unknown as number }),
    ];
    const bests = getPersonalBestPerStroke("swimmer1", sessions);
    expect(bests).toHaveLength(0);
  });
});

describe("getLastSessionForSwimmer", () => {
  test("UT-36: returns the most recent completed session", () => {
    const sessions: Session[] = [
      makeSession({ id: "s1", date: "2025-05-01", status: "completed" }),
      makeSession({ id: "s2", date: "2025-07-01", status: "completed" }),
      makeSession({ id: "s3", date: "2025-06-01", status: "completed" }),
    ];
    const last = getLastSessionForSwimmer("swimmer1", sessions);
    expect(last?.id).toBe("s2");
  });

  test("UT-37: ignores pending sessions", () => {
    const sessions: Session[] = [
      makeSession({ id: "s1", date: "2025-07-01", status: "pending" }),
      makeSession({ id: "s2", date: "2025-05-01", status: "completed" }),
    ];
    const last = getLastSessionForSwimmer("swimmer1", sessions);
    expect(last?.id).toBe("s2");
  });

  test("UT-38: returns undefined when no completed sessions", () => {
    const sessions: Session[] = [
      makeSession({ status: "pending" }),
    ];
    const last = getLastSessionForSwimmer("swimmer1", sessions);
    expect(last).toBeUndefined();
  });
});

describe("getMonthlyStrokeStats", () => {
  const now = new Date();
  const thisYear = now.getFullYear();
  const thisMonth = String(now.getMonth() + 1).padStart(2, "0");
  const thisMonthDate = (day: number) =>
    `${thisYear}-${thisMonth}-${String(day).padStart(2, "0")}`;

  test("UT-39: averages quality scores for current month", () => {
    const sessions: Session[] = [
      makeSession({ id: "s1", strokeType: "Freestyle", qualityScore: 60, date: thisMonthDate(1) }),
      makeSession({ id: "s2", strokeType: "Freestyle", qualityScore: 80, date: thisMonthDate(5) }),
    ];
    const stats = getMonthlyStrokeStats("swimmer1", sessions);
    const freestyle = stats.find((s) => s.strokeType === "Freestyle");
    expect(freestyle?.avgScore).toBe(70);
    expect(freestyle?.count).toBe(2);
  });

  test("UT-40: excludes sessions from other months", () => {
    const sessions: Session[] = [
      makeSession({ strokeType: "Freestyle", qualityScore: 90, date: "2020-01-01" }),
    ];
    const stats = getMonthlyStrokeStats("swimmer1", sessions);
    const freestyle = stats.find((s) => s.strokeType === "Freestyle");
    expect(freestyle).toBeUndefined();
  });

  test("UT-41: returns empty array when no sessions this month", () => {
    const stats = getMonthlyStrokeStats("swimmer1", []);
    expect(stats).toHaveLength(0);
  });
});
