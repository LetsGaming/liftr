import { describe, expect, it } from "vitest";
import { computeBodyweightTrend } from "./bodyweightTrend.js";

describe("computeBodyweightTrend", () => {
  it("returns null for an empty log", () => {
    expect(computeBodyweightTrend([])).toBeNull();
  });

  it("a single entry is its own EMA, stable, zero-day span", () => {
    const r = computeBodyweightTrend([{ date: "2026-01-01", weightKg: 80 }]);
    expect(r).toEqual({ emaKg: 80, trend: "stable", daysSpan: 0 });
  });

  it("detects a rising trend (hand-computed EMA, alpha=0.2)", () => {
    const entries = [
      { date: "2026-01-01", weightKg: 70 },
      { date: "2026-01-02", weightKg: 70.5 },
      { date: "2026-01-03", weightKg: 71 },
      { date: "2026-01-04", weightKg: 71.5 },
      { date: "2026-01-05", weightKg: 72 },
    ];
    const r = computeBodyweightTrend(entries);
    expect(r?.trend).toBe("up");
    expect(r?.emaKg).toBeCloseTo(70.8192, 4);
    expect(r?.daysSpan).toBe(4);
  });

  it("detects a falling trend", () => {
    const entries = [
      { date: "2026-01-01", weightKg: 90 },
      { date: "2026-01-02", weightKg: 89.5 },
      { date: "2026-01-03", weightKg: 89 },
      { date: "2026-01-04", weightKg: 88.5 },
      { date: "2026-01-05", weightKg: 88 },
    ];
    const r = computeBodyweightTrend(entries);
    expect(r?.trend).toBe("down");
  });

  it("small day-to-day noise within the dead zone reads as stable", () => {
    const entries = [
      { date: "2026-01-01", weightKg: 80 },
      { date: "2026-01-02", weightKg: 80.2 },
      { date: "2026-01-03", weightKg: 79.9 },
      { date: "2026-01-04", weightKg: 80.1 },
      { date: "2026-01-05", weightKg: 80.0 },
    ];
    const r = computeBodyweightTrend(entries);
    expect(r?.trend).toBe("stable");
  });

  it("is order-independent — desc (server) order gives the same result as asc", () => {
    const asc = [
      { date: "2026-01-01", weightKg: 70 },
      { date: "2026-01-02", weightKg: 70.5 },
      { date: "2026-01-03", weightKg: 71 },
    ];
    const desc = [...asc].reverse();
    expect(computeBodyweightTrend(desc)).toEqual(computeBodyweightTrend(asc));
  });
});
