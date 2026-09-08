import { describe, expect, it } from "vitest";
import { haversineM, MAX_PLAUSIBLE_SPEED_M_S, pathDistanceM, PLAUSIBILITY_FLOOR } from "@liftr/shared";
import {
  computeRunPlausibility,
  DISTANCE_MISMATCH_FINE_FRACTION,
  DISTANCE_MISMATCH_MAX_SEVERITY_FRACTION,
  RUN_SPEED_FINE_THRESHOLD_M_S,
} from "@liftr/shared/rank/runPlausibility";

/** Builds a chronological run_points array walking east along the equator in fixed steps, so
 *  `pathDistanceM` over it is easy to reason about (cos(0) = 1, so each degree of longitude is
 *  ~111,320m regardless of step size). `stepDeg` per point, `count` points, 1 second apart. */
function equatorPoints(stepDeg: number, count: number): { t: number; lat: number; lon: number }[] {
  return Array.from({ length: count }, (_, i) => ({ t: i * 1000, lat: 0, lon: i * stepDeg }));
}

describe("computeRunPlausibility", () => {
  it("does not flag a plausible elite run (sub-15:00 5K) just for being fast", () => {
    // 5000m in 899s (14:59) ~= 5.56 m/s, well under RUN_SPEED_FINE_THRESHOLD_M_S and nowhere near
    // MAX_PLAUSIBLE_SPEED_M_S (8 m/s) -- real elite 5K/10K/marathon pace all sit well below this.
    const result = computeRunPlausibility({ distanceM: 5000, durationS: 899, points: [] });
    expect(result).toEqual({ multiplier: 1, reason: null });
  });

  it("does not flag average speed at or above the fine threshold", () => {
    const result = computeRunPlausibility({
      distanceM: RUN_SPEED_FINE_THRESHOLD_M_S * 1000,
      durationS: 1000,
      points: [],
    });
    expect(result.reason).not.toBe("sustained_speed");
    expect(result.multiplier).toBe(1);
  });

  it("flags a physically-impossible sustained pace", () => {
    // 10 m/s (36 km/h) sustained over 10km -- well past MAX_PLAUSIBLE_SPEED_M_S for a run.
    const result = computeRunPlausibility({ distanceM: 10_000, durationS: 1000, points: [] });
    expect(result.reason).toBe("sustained_speed");
    expect(result.multiplier).toBeLessThan(1);
  });

  it("floors sustained-speed severity at/beyond MAX_PLAUSIBLE_SPEED_M_S", () => {
    const atCeiling = computeRunPlausibility({
      distanceM: MAX_PLAUSIBLE_SPEED_M_S * 1000,
      durationS: 1000,
      points: [],
    });
    const wellBeyond = computeRunPlausibility({
      distanceM: (MAX_PLAUSIBLE_SPEED_M_S + 5) * 1000,
      durationS: 1000,
      points: [],
    });
    expect(atCeiling.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
    expect(wellBeyond.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("does not flag distance/duration consistency when recomputed distance is close to stored", () => {
    const points = equatorPoints(0.001, 50); // ~111.32m per step
    const actual = pathDistanceM(points);
    const result = computeRunPlausibility({
      distanceM: actual * (1 + DISTANCE_MISMATCH_FINE_FRACTION - 0.01),
      durationS: 3000, // slow, plausible pace so sustained_speed can't fire
      points,
    });
    expect(result.reason).not.toBe("distance_mismatch");
    expect(result.multiplier).toBe(1);
  });

  it("flags a genuine distance/duration mismatch (fabricated or corrupted stored distance)", () => {
    const points = equatorPoints(0.001, 50);
    const actual = pathDistanceM(points);
    // stored distance claims far more than the run's own points support.
    const result = computeRunPlausibility({
      distanceM: actual * 2.5,
      durationS: 3000, // kept slow relative to the *stored* distance so speed doesn't dominate
      points,
    });
    expect(result.reason).toBe("distance_mismatch");
    expect(result.multiplier).toBeLessThan(1);
  });

  it("floors distance-mismatch severity at/beyond the max-severity fraction", () => {
    const points = equatorPoints(0.001, 50);
    const actual = pathDistanceM(points);
    const stored = actual / (1 - DISTANCE_MISMATCH_MAX_SEVERITY_FRACTION - 0.1); // well past max fraction
    const result = computeRunPlausibility({ distanceM: stored, durationS: 5000, points });
    expect(result.reason).toBe("distance_mismatch");
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("skips the distance-mismatch check when there are fewer than 2 points (no GPS trail)", () => {
    const result = computeRunPlausibility({ distanceM: 5000, durationS: 3000, points: [] });
    expect(result).toEqual({ multiplier: 1, reason: null });

    const onePoint = computeRunPlausibility({
      distanceM: 5000,
      durationS: 3000,
      points: [{ t: 0, lat: 0, lon: 0 }],
    });
    expect(onePoint).toEqual({ multiplier: 1, reason: null });
  });

  it("combines checks by taking the worst (lowest) resulting multiplier, not an average", () => {
    const points = equatorPoints(0.001, 50);
    const actual = pathDistanceM(points);
    // both heuristics maximally severe: absurd stored distance AND absurdly short duration.
    const result = computeRunPlausibility({ distanceM: actual * 5, durationS: 10, points });
    expect(result.multiplier).toBeCloseTo(PLAUSIBILITY_FLOOR, 6);
  });

  it("handles zero/degenerate input without throwing", () => {
    expect(computeRunPlausibility({ distanceM: 0, durationS: 0, points: [] })).toEqual({
      multiplier: 1,
      reason: null,
    });
    expect(computeRunPlausibility({ distanceM: 5000, durationS: 0, points: [] })).toEqual({
      multiplier: 1,
      reason: null,
    });
  });

  it("is a pure function with no knowledge of run source (manual vs GPS)", () => {
    // sanity check on the type surface: RunPlausibilityInput has no `source` field at all, so
    // there is nothing here for a caller to even pass -- gating manual runs out is Task 8's job
    // at the call site, not this module's.
    const input = { distanceM: 5000, durationS: 1500, points: [] };
    expect(() => computeRunPlausibility(input)).not.toThrow();
    // haversineM/pathDistanceM sanity: two identical points are 0m apart.
    expect(haversineM({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
  });
});
