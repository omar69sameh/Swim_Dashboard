import {
  formatDuration,
  formatDate,
  formatDateTime,
  getStrokeEmoji,
  getCategoryColor,
  getCategoryBg,
  qualityTierDisplay,
} from "@/lib/utils";

describe("formatDuration", () => {
  test("UT-01: converts 90 seconds to 1:30", () => {
    expect(formatDuration(90)).toBe("1:30");
  });

  test("UT-02: converts 0 seconds to 0:00", () => {
    expect(formatDuration(0)).toBe("0:00");
  });

  test("UT-03: converts 3661 seconds to 61:01", () => {
    expect(formatDuration(3661)).toBe("61:01");
  });

  test("UT-04: pads single-digit seconds", () => {
    expect(formatDuration(65)).toBe("1:05");
  });

  test("UT-05: exactly 60 seconds = 1:00", () => {
    expect(formatDuration(60)).toBe("1:00");
  });
});

describe("getStrokeEmoji", () => {
  test("UT-06: Butterfly returns 🦋", () => {
    expect(getStrokeEmoji("Butterfly")).toBe("🦋");
  });

  test("UT-07: Freestyle returns 🏊", () => {
    expect(getStrokeEmoji("Freestyle")).toBe("🏊");
  });

  test("UT-08: unknown stroke returns default 🏊", () => {
    expect(getStrokeEmoji("Sidestroke")).toBe("🏊");
  });
});

describe("getCategoryColor", () => {
  test("UT-09: good → emerald", () => {
    expect(getCategoryColor("good")).toBe("text-emerald-400");
  });

  test("UT-10: average → amber", () => {
    expect(getCategoryColor("average")).toBe("text-amber-400");
  });

  test("UT-11: needs_improvement → rose", () => {
    expect(getCategoryColor("needs_improvement")).toBe("text-rose-400");
  });

  test("UT-12: unknown → slate", () => {
    expect(getCategoryColor("unknown")).toBe("text-slate-400");
  });
});

describe("getCategoryBg", () => {
  test("UT-13: good → emerald bg", () => {
    expect(getCategoryBg("good")).toBe("bg-emerald-400/10");
  });

  test("UT-14: unknown category → slate bg", () => {
    expect(getCategoryBg("other")).toBe("bg-slate-400/10");
  });
});

describe("qualityTierDisplay", () => {
  test("UT-15: tier=low → Low Risk / emerald", () => {
    const result = qualityTierDisplay("low", undefined);
    expect(result.text).toBe("Low Risk");
    expect(result.color).toBe("text-emerald-400");
  });

  test("UT-16: tier=good → Low Risk / emerald", () => {
    const result = qualityTierDisplay("good", undefined);
    expect(result.text).toBe("Low Risk");
  });

  test("UT-17: tier=moderate → Moderate Risk / amber", () => {
    const result = qualityTierDisplay("moderate", undefined);
    expect(result.text).toBe("Moderate Risk");
    expect(result.color).toBe("text-amber-400");
  });

  test("UT-18: tier=moderate_high → Moderate-High Risk / orange", () => {
    const result = qualityTierDisplay("moderate_high", undefined);
    expect(result.text).toBe("Moderate-High Risk");
    expect(result.color).toBe("text-orange-400");
  });

  test("UT-19: tier=high → High Risk / rose", () => {
    const result = qualityTierDisplay("high", undefined);
    expect(result.text).toBe("High Risk");
    expect(result.color).toBe("text-rose-400");
  });

  test("UT-20: tier=bad → High Risk / rose", () => {
    const result = qualityTierDisplay("bad", undefined);
    expect(result.text).toBe("High Risk");
  });

  test("UT-21: no tier, label=good → Low Risk fallback", () => {
    const result = qualityTierDisplay(undefined, "good");
    expect(result.text).toBe("Low Risk");
  });

  test("UT-22: no tier, label=bad → High Risk fallback", () => {
    const result = qualityTierDisplay(undefined, "bad");
    expect(result.text).toBe("High Risk");
  });

  test("UT-23: undefined tier and label → Unknown", () => {
    const result = qualityTierDisplay(undefined, undefined);
    expect(result.text).toBe("Unknown");
  });

  test("UT-24: tier with dashes normalised (moderate-high)", () => {
    const result = qualityTierDisplay("moderate-high", undefined);
    expect(result.text).toBe("Moderate-High Risk");
  });
});

describe("formatDate", () => {
  test("UT-25: formats ISO date string to readable date", () => {
    const result = formatDate("2025-06-15");
    expect(result).toMatch(/Jun/);
    expect(result).toMatch(/15/);
    expect(result).toMatch(/2025/);
  });
});
