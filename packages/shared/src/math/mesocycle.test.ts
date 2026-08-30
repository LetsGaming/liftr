import { describe, expect, it } from "vitest";
import { applyMesocycleWeek, generateMesocycleWeekPercents } from "./mesocycle.js";

describe("generateMesocycleWeekPercents", () => {
  it("a single-week cycle is just 100%", () => {
    expect(generateMesocycleWeekPercents(1)).toEqual([100]);
  });

  it("ramps +5%/week then deloads to 60% on the final week", () => {
    expect(generateMesocycleWeekPercents(4)).toEqual([100, 105, 110, 60]);
  });

  it("scales the ramp length to a longer cycle", () => {
    expect(generateMesocycleWeekPercents(6)).toEqual([100, 105, 110, 115, 120, 60]);
  });
});

describe("applyMesocycleWeek", () => {
  it("returns null when there's no last-time weight to scale", () => {
    expect(applyMesocycleWeek(null, 105)).toBeNull();
  });

  it("scales by the week percent and rounds to the stepper increment", () => {
    expect(applyMesocycleWeek(100, 105)).toBe(105); // 100*1.05=105, already on a 1.25kg step
    expect(applyMesocycleWeek(100, 60)).toBe(60); // deload week
  });

  it("rounds to the nearest 1.25kg increment", () => {
    expect(applyMesocycleWeek(87.5, 110)).toBe(96.25); // 87.5*1.10=96.25 exactly
    expect(applyMesocycleWeek(83, 105)).toBe(87.5); // 83*1.05=87.15 -> rounds to 87.5
  });
});
