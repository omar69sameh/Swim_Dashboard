import {
  getSwimmerListOptions,
  getSessionFilters,
  canAccessSwimmer,
  homePathForRole,
} from "@/lib/access";
import type { AuthUser } from "@/types/auth";

const coachUser: AuthUser = {
  id: "coach1",
  email: "coach@test.com",
  role: "coach",
  name: "Test Coach",
  coachId: "coach1",
};

const swimmerUser: AuthUser = {
  id: "swimmer1",
  email: "swimmer@test.com",
  role: "swimmer",
  name: "Test Swimmer",
  swimmerId: "swimmer1",
};

const adminUser: AuthUser = {
  id: "admin1",
  email: "admin@test.com",
  role: "admin",
  name: "Test Admin",
};

describe("getSwimmerListOptions", () => {
  test("UT-42: null user returns undefined", () => {
    expect(getSwimmerListOptions(null)).toBeUndefined();
  });

  test("UT-43: swimmer user returns swimmerId option", () => {
    const opts = getSwimmerListOptions(swimmerUser);
    expect(opts).toEqual({ swimmerId: "swimmer1" });
  });

  test("UT-44: coach user returns coachId option", () => {
    const opts = getSwimmerListOptions(coachUser);
    expect(opts).toEqual({ coachId: "coach1" });
  });

  test("UT-45: admin user returns undefined (no matching role)", () => {
    expect(getSwimmerListOptions(adminUser)).toBeUndefined();
  });
});

describe("getSessionFilters", () => {
  test("UT-46: explicit swimmerId takes priority over user role", () => {
    const filters = getSessionFilters(coachUser, "overrideSwimmer");
    expect(filters).toEqual({ swimmerId: "overrideSwimmer" });
  });

  test("UT-47: swimmer user gets own swimmerId filter", () => {
    const filters = getSessionFilters(swimmerUser);
    expect(filters).toEqual({ swimmerId: "swimmer1" });
  });

  test("UT-48: coach user gets empty filter (sees all assigned)", () => {
    const filters = getSessionFilters(coachUser);
    expect(filters).toEqual({});
  });

  test("UT-49: null user with no swimmerId returns undefined", () => {
    expect(getSessionFilters(null)).toBeUndefined();
  });
});

describe("canAccessSwimmer", () => {
  test("UT-50: null user cannot access any swimmer", () => {
    expect(canAccessSwimmer(null, "swimmer1")).toBe(false);
  });

  test("UT-51: swimmer can access their own swimmerId", () => {
    expect(canAccessSwimmer(swimmerUser, "swimmer1")).toBe(true);
  });

  test("UT-52: swimmer cannot access another swimmer's data", () => {
    expect(canAccessSwimmer(swimmerUser, "otherSwimmer")).toBe(false);
  });

  test("UT-53: coach should only access assigned swimmers — FAILS (BUG-02 OWASP A01)", () => {
    // canAccessSwimmer() is supposed to verify the coach-swimmer assignment
    // before granting access. Currently it returns true unconditionally for all
    // coaches (BUG-02). This test documents the CORRECT expected behaviour and
    // will fail until BUG-02 is resolved.
    expect(canAccessSwimmer(coachUser, "unassigned-swimmer-xyz")).toBe(false);
  });

  test("UT-54: admin role returns false (not coach or swimmer)", () => {
    expect(canAccessSwimmer(adminUser, "swimmer1")).toBe(false);
  });
});

describe("homePathForRole", () => {
  test("UT-55: coach → /coach", () => {
    expect(homePathForRole("coach")).toBe("/coach");
  });

  test("UT-56: swimmer → /swimmer", () => {
    expect(homePathForRole("swimmer")).toBe("/swimmer");
  });

  test("UT-57: admin → /admin", () => {
    expect(homePathForRole("admin")).toBe("/admin");
  });
});

describe("getSessionFilters — BUG-05 detection", () => {
  test("UT-58: swimmer with no swimmerId should return a safe filter, not undefined — FAILS (BUG-05)", () => {
    // A swimmer whose profile has not yet populated swimmerId (e.g., during
    // first-login race condition) causes getSessionFilters to return undefined.
    // The service layer treats undefined as "no filter" — fetching ALL sessions.
    // This is a data-isolation defect. Expected: a restrictive filter, not undefined.
    const swimmerNoId: AuthUser = {
      id: "s-noid",
      email: "noid@swim.com",
      role: "swimmer",
      name: "Profile Not Ready",
    };
    const filter = getSessionFilters(swimmerNoId);
    expect(filter).not.toBeUndefined(); // FAILS — BUG-05: currently returns undefined
  });
});
