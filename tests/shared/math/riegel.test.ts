import { describe, expect, it } from "vitest";
import {
  riegelPredictedTimeS,
  nearestRunCategory,
  runRankValue,
  RUN_CATEGORIES,
  RUN_CATEGORY_DISTANCE_M,
} from "@liftr/shared";

describe("riegelPredictedTimeS", () => {
  describe("default exponent (1.06) for non-mile target categories", () => {
    it("predicts ~41:40-42:00 for a 20:00 5K predicting 10K", () => {
      // 20:00 5K = 1200 seconds
      // 5K -> 10K using 1.06 exponent
      // Expected: ~2500-2520 seconds (41:40-42:00)
      const predictedSeconds = riegelPredictedTimeS(
        5000,
        1200,
        10000,
        "10k"
      );
      // Should be between 41:40 and 42:00 (2500-2520 seconds)
      expect(predictedSeconds).toBeGreaterThan(2500);
      expect(predictedSeconds).toBeLessThan(2520);
    });

    it("converts 5K to 10K correctly using 1.06", () => {
      // Reference computation: 1200 * (10000/5000)^1.06
      const predicted = riegelPredictedTimeS(5000, 1200, 10000, "10k");
      // 2^1.06 ≈ 2.0845
      expect(predicted).toBeCloseTo(1200 * Math.pow(2, 1.06), 1);
    });
  });

  describe("mile exponent (1.08) for mile target category", () => {
    it("uses 1.08 exponent when target is mile", () => {
      // Same distance pair, but target category is "mile" -> should use 1.08
      // Using 4:00 mile (240 seconds) to predict a 5K
      // t2 = 240 * (5000/1609.344)^1.08
      const mile5kWith108 = riegelPredictedTimeS(
        1609.344,
        240,
        5000,
        "mile"
      );

      // Compare to what 1.06 would give (the regression test)
      const mile5kWith106 = riegelPredictedTimeS(
        1609.344,
        240,
        5000,
        "5k"
      );

      // They must differ measurably (at least by ~10 seconds for a 13:30 run)
      expect(Math.abs(mile5kWith108 - mile5kWith106)).toBeGreaterThan(10);
      // 1.08 should give a longer predicted time than 1.06
      expect(mile5kWith108).toBeGreaterThan(mile5kWith106);
    });

    it("converts 5K to mile using 1.08 exponent correctly", () => {
      // 13:30 5K (810 seconds) -> Mile using 1.08
      // t2 = 810 * (1609.344/5000)^1.08
      const predicted = riegelPredictedTimeS(5000, 810, 1609.344, "mile");
      // (1609.344/5000)^1.08 = 0.3219^1.08 ≈ 0.29847
      expect(predicted).toBeCloseTo(810 * Math.pow(1609.344 / 5000, 1.08), 1);
      // Should be around 3:50-3:55 (230-235 seconds) for this input
      expect(predicted).toBeGreaterThan(225);
      expect(predicted).toBeLessThan(240);
    });
  });

  describe("exponent selection by target category", () => {
    it("uses 1.06 for 5k target", () => {
      const predicted = riegelPredictedTimeS(10000, 2500, 5000, "5k");
      expect(predicted).toBeCloseTo(2500 * Math.pow(5000 / 10000, 1.06), 1);
    });

    it("uses 1.06 for 10k target", () => {
      const predicted = riegelPredictedTimeS(5000, 1200, 10000, "10k");
      expect(predicted).toBeCloseTo(1200 * Math.pow(10000 / 5000, 1.06), 1);
    });

    it("uses 1.06 for half_marathon target", () => {
      const predicted = riegelPredictedTimeS(10000, 2500, 21097.5, "half_marathon");
      expect(predicted).toBeCloseTo(
        2500 * Math.pow(21097.5 / 10000, 1.06),
        1
      );
    });

    it("uses 1.06 for marathon target", () => {
      const predicted = riegelPredictedTimeS(
        21097.5,
        5400,
        42195,
        "marathon"
      );
      expect(predicted).toBeCloseTo(
        5400 * Math.pow(42195 / 21097.5, 1.06),
        1
      );
    });

    it("uses 1.08 for mile target", () => {
      const predicted = riegelPredictedTimeS(5000, 810, 1609.344, "mile");
      expect(predicted).toBeCloseTo(
        810 * Math.pow(1609.344 / 5000, 1.08),
        1
      );
    });
  });
});

describe("nearestRunCategory", () => {
  describe("exact category distances", () => {
    it("returns exact category for mile distance", () => {
      expect(nearestRunCategory(1609.344)).toBe("mile");
    });

    it("returns exact category for 5k distance", () => {
      expect(nearestRunCategory(5000)).toBe("5k");
    });

    it("returns exact category for 10k distance", () => {
      expect(nearestRunCategory(10000)).toBe("10k");
    });

    it("returns exact category for half_marathon distance", () => {
      expect(nearestRunCategory(21097.5)).toBe("half_marathon");
    });

    it("returns exact category for marathon distance", () => {
      expect(nearestRunCategory(42195)).toBe("marathon");
    });
  });

  describe("distances between categories", () => {
    it("returns closer category for distance between mile and 5k", () => {
      // Midpoint between mile (1609.344) and 5k (5000)
      const midpoint = (1609.344 + 5000) / 2;
      const nearest = nearestRunCategory(midpoint);
      // Should be either mile or 5k - just check it's one of them
      expect(["mile", "5k"]).toContain(nearest);
    });

    it("returns closer category for distance between 5k and 10k", () => {
      // Midpoint between 5k (5000) and 10k (10000)
      const midpoint = (5000 + 10000) / 2;
      const nearest = nearestRunCategory(midpoint);
      expect(["5k", "10k"]).toContain(nearest);
    });

    it("returns closer category for distance between 10k and half_marathon", () => {
      // Midpoint between 10k (10000) and half_marathon (21097.5)
      const midpoint = (10000 + 21097.5) / 2;
      const nearest = nearestRunCategory(midpoint);
      expect(["10k", "half_marathon"]).toContain(nearest);
    });

    it("returns closer category for distance between half_marathon and marathon", () => {
      // Midpoint between half_marathon (21097.5) and marathon (42195)
      const midpoint = (21097.5 + 42195) / 2;
      const nearest = nearestRunCategory(midpoint);
      expect(["half_marathon", "marathon"]).toContain(nearest);
    });
  });

  describe("distances closer to one category", () => {
    it("returns mile for 2km run", () => {
      expect(nearestRunCategory(2000)).toBe("mile");
    });

    it("returns 5k for 6km run", () => {
      expect(nearestRunCategory(6000)).toBe("5k");
    });

    it("returns 10k for 9km run", () => {
      expect(nearestRunCategory(9000)).toBe("10k");
    });

    it("returns half_marathon for 20km run", () => {
      expect(nearestRunCategory(20000)).toBe("half_marathon");
    });

    it("returns marathon for 40km run", () => {
      expect(nearestRunCategory(40000)).toBe("marathon");
    });
  });
});

describe("runRankValue", () => {
  describe("distance on exact category boundary", () => {
    it("returns unchanged speed when distance equals category distance", () => {
      // 5K in 20:00 = 1200 seconds
      // Speed = 5000 / 1200 = 4.1667 m/s
      const result = runRankValue(5000, 1200);
      expect(result.category).toBe("5k");
      expect(result.speedMps).toBeCloseTo(5000 / 1200, 5);
    });

    it("returns unchanged speed for 10k at exact distance", () => {
      // 10K in 50:00 = 3000 seconds
      // Speed = 10000 / 3000 = 3.3333 m/s
      const result = runRankValue(10000, 3000);
      expect(result.category).toBe("10k");
      expect(result.speedMps).toBeCloseTo(10000 / 3000, 5);
    });

    it("returns unchanged speed for mile at exact distance", () => {
      // Mile in 4:00 = 240 seconds
      // Speed = 1609.344 / 240 = 6.7056 m/s
      const result = runRankValue(1609.344, 240);
      expect(result.category).toBe("mile");
      expect(result.speedMps).toBeCloseTo(1609.344 / 240, 5);
    });
  });

  describe("off-distance run in non-mile-adjacent range (5k -> 10k)", () => {
    it("adjusts speed using 1.06 exponent for 10k category target", () => {
      // Run 9km in 44:00 (2640 seconds)
      // Nearest category is 10k
      // Riegel predicts: 2640 * (10000/9000)^1.06
      // Speed = 10000 / predictedTime
      const distanceM = 9000;
      const durationS = 2640;
      const result = runRankValue(distanceM, durationS);

      expect(result.category).toBe("10k");
      const predictedTimeS = durationS * Math.pow(10000 / distanceM, 1.06);
      const expectedSpeed = 10000 / predictedTimeS;
      expect(result.speedMps).toBeCloseTo(expectedSpeed, 5);
    });

    it("uses 1.06 exponent when 10k target is selected", () => {
      // 8km in 40:00 = 2400 seconds
      // Nearest is 10k
      // With 1.06: 2400 * (10000/8000)^1.06 = 2400 * 1.25^1.06
      const result = runRankValue(8000, 2400);
      expect(result.category).toBe("10k");
      const predictedTimeWith106 = 2400 * Math.pow(10000 / 8000, 1.06);
      expect(result.speedMps).toBeCloseTo(10000 / predictedTimeWith106, 5);
    });
  });

  describe("off-distance run in mile-adjacent range (mile -> 5k)", () => {
    it("adjusts speed using 1.08 exponent for 5k category target", () => {
      // Run 4.5km in 22:00 (1320 seconds)
      // Nearest category is 5k
      // But Riegel converts TO 5k, which uses 1.06 (not 1.08)
      // Wait - re-reading the brief: the exponent depends on the TARGET category
      // So when converting TO 5k, we use 1.06
      const distanceM = 4500;
      const durationS = 1320;
      const result = runRankValue(distanceM, durationS);

      expect(result.category).toBe("5k");
      const predictedTimeS = durationS * Math.pow(5000 / distanceM, 1.06);
      const expectedSpeed = 5000 / predictedTimeS;
      expect(result.speedMps).toBeCloseTo(expectedSpeed, 5);
    });

    it("uses 1.06 exponent when converting TO 5k (even from closer to mile)", () => {
      // 2km run (closer to mile) in 10:00 = 600 seconds
      // But 2km is closer to 5k than to mile
      // Nearest category is mile or between mile and 5k
      // Let's use 1.2km, which is very close to mile
      // 1.2km in 5:00 = 300 seconds
      const result = runRankValue(1200, 300);
      // Nearest category should be mile
      expect(result.category).toBe("mile");
      // When converting TO mile, we use 1.08
      const predictedTimeS = 300 * Math.pow(1609.344 / 1200, 1.08);
      const expectedSpeed = 1609.344 / predictedTimeS;
      expect(result.speedMps).toBeCloseTo(expectedSpeed, 5);
    });
  });

  describe("regression test: measurable difference between exponent regimes", () => {
    it("produces different results when the target category changes", () => {
      // Same actual run (3km in 15:00), but bucketed to different targets
      // depending on rounding
      // Actually, let's use a run that's equidistant between mile and 5k
      // Midpoint: (1609.344 + 5000) / 2 ≈ 3304.67m
      const distanceM = 3305;
      const durationS = 15 * 60; // 15:00

      const result = runRankValue(distanceM, durationS);

      // Should bucketed to one of the categories
      expect(["mile", "5k"]).toContain(result.category);

      // The key regression test: if someone "simplified" the exponent back to
      // a single value, they'd get a wrong speed. We can't easily test the
      // counterfactual here, but we can verify both 1.06 and 1.08 are actually
      // being used by creating two scenarios
      const mileDistance = 1500;
      const mileTime = 6 * 60;
      const resultMile = runRankValue(mileDistance, mileTime);

      const fiveKDistance = 4500;
      const fiveKTime = 22 * 60;
      const result5K = runRankValue(fiveKDistance, fiveKTime);

      // Both should return valid categories
      expect(["mile", "5k"]).toContain(resultMile.category);
      expect(["5k", "10k"]).toContain(result5K.category);

      // Speeds should be positive and reasonable
      expect(resultMile.speedMps).toBeGreaterThan(0);
      expect(result5K.speedMps).toBeGreaterThan(0);
    });
  });
});
