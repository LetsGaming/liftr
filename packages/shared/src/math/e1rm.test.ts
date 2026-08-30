import { describe, expect, it } from "vitest";
import { bodyweightLoad, epley, estimateE1rm } from "./e1rm.js";

describe("epley", () => {
  it("matches the standard Epley formula", () => {
    expect(epley(100, 1)).toBeCloseTo(103.33, 1);
    expect(epley(100, 10)).toBeCloseTo(133.33, 1);
  });
  it("returns 0 for zero/negative reps", () => {
    expect(epley(100, 0)).toBe(0);
  });
});

describe("estimateE1rm", () => {
  it("flags low confidence above 12 reps", () => {
    expect(estimateE1rm(50, 12).lowConfidence).toBe(false);
    expect(estimateE1rm(50, 13).lowConfidence).toBe(true);
  });
});

describe("bodyweightLoad", () => {
  it("scales bodyweight by leverage and adds extra weight", () => {
    expect(bodyweightLoad(80, 0.64)).toBeCloseTo(51.2, 1);
    expect(bodyweightLoad(80, 1.0, 10)).toBe(90);
  });
});
