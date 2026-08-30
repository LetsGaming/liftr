import { describe, expect, it } from "vitest";
import { warmupRamp } from "./warmup.js";

describe("warmupRamp", () => {
  it("builds a full 3-step ramp for a heavy working weight", () => {
    expect(warmupRamp(100, 20)).toEqual([
      { weightKg: 40, reps: 5 },
      { weightKg: 60, reps: 3 },
      { weightKg: 80, reps: 2 },
    ]);
  });

  it("drops steps that would round to the bar weight or below", () => {
    expect(warmupRamp(50, 20)).toEqual([
      { weightKg: 30, reps: 3 },
      { weightKg: 40, reps: 2 },
    ]);
  });

  it("returns no warm-up sets for a working weight already near the bar", () => {
    expect(warmupRamp(25, 20)).toEqual([]);
  });
});
