/**
 * Integration tests for the dashboard — verify cross-module logic and
 * service-layer contracts using lightweight mocks in place of live Supabase.
 */

import {
  canAccessSwimmer,
  getSessionFilters,
  getSwimmerListOptions,
  homePathForRole,
} from "@/lib/access";
import {
  getPersonalBestPerStroke,
  getStrokeScoresForSwimmer,
  getMonthlyStrokeStats,
  getLastSessionForSwimmer,
} from "@/lib/stroke-scores";
import { qualityTierDisplay, formatDuration } from "@/lib/utils";
import type { AuthUser } from "@/types/auth";
import type { Session } from "@/types";

// ─── Shared fixtures ──────────────────────────────────────────────────────────

const coachUser: AuthUser = { id: "c1", email: "coach@swim.com", role: "coach", name: "Ali Coach", coachId: "c1" };
const swimmerUser: AuthUser = { id: "s1", email: "swimmer@swim.com", role: "swimmer", name: "Khaled Swimmer", swimmerId: "s1" };

const now = new Date();
const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

function session(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess1",
    swimmerId: "s1",
    swimmerName: "Khaled Swimmer",
    date: `${thisMonth}-10`,
    duration: 300,
    distance: 100,
    poolLength: 50,
    strokeType: "Freestyle",
    status: "completed",
    qualityScore: 75,
    qualityTier: "moderate",
    qualityLabel: "average",
    numStrokes: 25,
    createdAt: `${thisMonth}-10T10:00:00Z`,
    ...overrides,
  };
}

// ─── IT-01: Auth role → correct home path ─────────────────────────────────────
describe("IT-01: Role-based routing", () => {
  test("coach is routed to /coach", () => {
    expect(homePathForRole(coachUser.role)).toBe("/coach");
  });

  test("swimmer is routed to /swimmer", () => {
    expect(homePathForRole(swimmerUser.role)).toBe("/swimmer");
  });

  test("admin is routed to /admin", () => {
    expect(homePathForRole("admin")).toBe("/admin");
  });
});

// ─── IT-02: Coach session filter returns all (server enforces assignment) ──────
describe("IT-02: Coach data query filters", () => {
  test("coach gets empty filter object (server RLS filters by assignment)", () => {
    const filter = getSessionFilters(coachUser);
    expect(filter).toEqual({});
  });

  test("coach swimmer-list options carry coachId for assignment-scoped query", () => {
    const opts = getSwimmerListOptions(coachUser);
    expect(opts).toEqual({ coachId: "c1" });
  });
});

// ─── IT-03: Swimmer data isolation ────────────────────────────────────────────
describe("IT-03: Swimmer data isolation", () => {
  test("swimmer filter scopes query to own swimmerId", () => {
    const filter = getSessionFilters(swimmerUser);
    expect(filter).toEqual({ swimmerId: "s1" });
  });

  test("swimmer cannot access another swimmer's profile", () => {
    expect(canAccessSwimmer(swimmerUser, "other-swimmer")).toBe(false);
  });

  test("swimmer can access their own profile", () => {
    expect(canAccessSwimmer(swimmerUser, "s1")).toBe(true);
  });

  test("unauthenticated user is blocked from all profiles", () => {
    expect(canAccessSwimmer(null, "s1")).toBe(false);
  });
});

// ─── IT-04: Session data → stroke scores pipeline ─────────────────────────────
describe("IT-04: Stroke score calculation pipeline", () => {
  const sessions: Session[] = [
    session({ id: "a", strokeType: "Freestyle",    qualityScore: 60, date: `${thisMonth}-01` }),
    session({ id: "b", strokeType: "Freestyle",    qualityScore: 80, date: `${thisMonth}-05` }),
    session({ id: "c", strokeType: "Breaststroke", qualityScore: 70, date: `${thisMonth}-03` }),
  ];

  test("latest Freestyle score (not highest) returned as current score", () => {
    const scores = getStrokeScoresForSwimmer("s1", sessions);
    const fs = scores.find((s) => s.strokeType === "Freestyle");
    expect(fs?.qualityScore).toBe(80); // most recent date
  });

  test("personal best Freestyle is highest score across all sessions", () => {
    const bests = getPersonalBestPerStroke("s1", sessions);
    const fs = bests.find((b) => b.strokeType === "Freestyle");
    expect(fs?.qualityScore).toBe(80);
  });

  test("monthly stats aggregate both Freestyle sessions", () => {
    const stats = getMonthlyStrokeStats("s1", sessions);
    const fs = stats.find((s) => s.strokeType === "Freestyle");
    expect(fs?.count).toBe(2);
    expect(fs?.avgScore).toBe(70); // (60+80)/2
  });
});

// ─── IT-05: Quality tier → UI display pipeline ────────────────────────────────
describe("IT-05: ML quality tier → UI colour pipeline", () => {
  test("low tier session renders Low Risk with emerald colour", () => {
    const s = session({ qualityTier: "low", qualityScore: 85 });
    const display = qualityTierDisplay(s.qualityTier, s.qualityLabel);
    expect(display.text).toBe("Low Risk");
    expect(display.color).toContain("emerald");
  });

  test("high tier session renders High Risk with rose colour", () => {
    const s = session({ qualityTier: "high", qualityScore: 30 });
    const display = qualityTierDisplay(s.qualityTier, s.qualityLabel);
    expect(display.text).toBe("High Risk");
    expect(display.color).toContain("rose");
  });

  test("moderate_high tier renders Moderate-High Risk", () => {
    const s = session({ qualityTier: "moderate_high", qualityScore: 50 });
    const display = qualityTierDisplay(s.qualityTier, s.qualityLabel);
    expect(display.text).toBe("Moderate-High Risk");
  });
});

// ─── IT-06: Session duration formatting pipeline ──────────────────────────────
describe("IT-06: Session duration display pipeline", () => {
  test("300-second session displays as 5:00", () => {
    const s = session({ duration: 300 });
    expect(formatDuration(s.duration)).toBe("5:00");
  });

  test("90-second session displays as 1:30", () => {
    const s = session({ duration: 90 });
    expect(formatDuration(s.duration)).toBe("1:30");
  });
});

// ─── IT-07: Last session and personal best cross-check ────────────────────────
describe("IT-07: Last session vs personal best integrity", () => {
  const sessions: Session[] = [
    session({ id: "early", strokeType: "Freestyle", qualityScore: 95, date: "2025-01-01" }),
    session({ id: "recent", strokeType: "Freestyle", qualityScore: 60, date: `${thisMonth}-15` }),
  ];

  test("last session is most recent, not highest score", () => {
    const last = getLastSessionForSwimmer("s1", sessions);
    expect(last?.id).toBe("recent");
  });

  test("personal best is highest score, not most recent", () => {
    const bests = getPersonalBestPerStroke("s1", sessions);
    const fs = bests.find((b) => b.strokeType === "Freestyle");
    expect(fs?.sessionId).toBe("early");
  });
});

// ─── IT-08: Pending sessions excluded from all aggregations ───────────────────
describe("IT-08: Pending sessions excluded from all analytics", () => {
  const sessions: Session[] = [
    session({ id: "done", status: "completed", qualityScore: 80, date: `${thisMonth}-10` }),
    session({ id: "pend", status: "pending",   qualityScore: 99, date: `${thisMonth}-15` }),
  ];

  test("stroke scores ignore pending session", () => {
    const scores = getStrokeScoresForSwimmer("s1", sessions);
    const fs = scores.find((s) => s.strokeType === "Freestyle");
    expect(fs?.qualityScore).toBe(80);
  });

  test("personal best ignores pending session", () => {
    const bests = getPersonalBestPerStroke("s1", sessions);
    const fs = bests.find((b) => b.strokeType === "Freestyle");
    expect(fs?.qualityScore).toBe(80);
  });

  test("last session ignores pending", () => {
    const last = getLastSessionForSwimmer("s1", sessions);
    expect(last?.id).toBe("done");
  });

  test("monthly stats ignore pending", () => {
    const stats = getMonthlyStrokeStats("s1", sessions);
    const fs = stats.find((s) => s.strokeType === "Freestyle");
    expect(fs?.count).toBe(1);
    expect(fs?.avgScore).toBe(80);
  });
});
