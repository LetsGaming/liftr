import { describe, expect, it } from "vitest";
import { computeReadiness, DEFAULT_RECOVERY_HOURS } from "./recovery.js";

const NOW = new Date("2026-08-23T12:00:00Z");

function hoursAgo(n: number): Date {
  return new Date(NOW.getTime() - n * 60 * 60 * 1000);
}

describe("computeReadiness", () => {
  it("is fully recovered (1) when the muscle has never been trained", () => {
    expect(computeReadiness("quads", null, true, NOW)).toBe(1);
  });

  it("is fully fatigued (0) right when a set just landed", () => {
    expect(computeReadiness("quads", NOW, true, NOW)).toBe(0);
  });

  it("is exactly 1 once the primary recovery window has fully elapsed", () => {
    // quads: 72h window
    expect(computeReadiness("quads", hoursAgo(72), true, NOW)).toBe(1);
  });

  it("stays at 1 past the window, doesn't overshoot", () => {
    expect(computeReadiness("quads", hoursAgo(200), true, NOW)).toBe(1);
  });

  it("ramps linearly midway through the window", () => {
    // 36h into a 72h window = halfway
    expect(computeReadiness("quads", hoursAgo(36), true, NOW)).toBeCloseTo(0.5, 5);
  });

  it("uses the shorter window for a small/isolation muscle", () => {
    // biceps: 48h window, 24h in = halfway
    expect(computeReadiness("biceps", hoursAgo(24), true, NOW)).toBeCloseTo(0.5, 5);
  });

  it("falls back to the default window for an unlisted slug", () => {
    expect(computeReadiness("made-up-muscle", hoursAgo(DEFAULT_RECOVERY_HOURS), true, NOW)).toBe(1);
    expect(computeReadiness("made-up-muscle", hoursAgo(DEFAULT_RECOVERY_HOURS / 2), true, NOW)).toBeCloseTo(0.5, 5);
  });

  it("recovers faster from secondary-only involvement than primary", () => {
    const elapsed = hoursAgo(30);
    const primary = computeReadiness("quads", elapsed, true, NOW);
    const secondary = computeReadiness("quads", elapsed, false, NOW);
    expect(secondary).toBeGreaterThan(primary);
    // secondary window = 72h * 0.6 = 43.2h; 30h in = 30/43.2
    expect(secondary).toBeCloseTo(30 / 43.2, 5);
  });

  it("clamps negative elapsed time (future timestamp) to fully fatigued rather than going negative", () => {
    const future = new Date(NOW.getTime() + 60 * 60 * 1000);
    expect(computeReadiness("quads", future, true, NOW)).toBe(0);
  });

  describe("birthYear-adjusted window", () => {
    it("leaves the window unchanged for an unset birthYear (default behavior)", () => {
      expect(computeReadiness("quads", hoursAgo(36), true, NOW, null)).toBeCloseTo(0.5, 5);
      expect(computeReadiness("quads", hoursAgo(36), true, NOW, undefined)).toBeCloseTo(0.5, 5);
    });

    it("leaves the window unchanged below the adjustment threshold", () => {
      const birthYear = NOW.getUTCFullYear() - 30; // age 30, well under the 45 threshold
      expect(computeReadiness("quads", hoursAgo(36), true, NOW, birthYear)).toBeCloseTo(0.5, 5);
    });

    it("widens (never narrows) the window past the adjustment threshold", () => {
      const olderBirthYear = NOW.getUTCFullYear() - 60; // age 60
      const younger = computeReadiness("quads", hoursAgo(36), true, NOW, null);
      const older = computeReadiness("quads", hoursAgo(36), true, NOW, olderBirthYear);
      // same elapsed time, wider window => less far into it => lower readiness fraction
      expect(older).toBeLessThan(younger);
    });

    it("caps the widened window instead of scaling indefinitely for a very old birthYear", () => {
      const veryOldBirthYear = NOW.getUTCFullYear() - 100;
      const extremeBirthYear = NOW.getUTCFullYear() - 200;
      const veryOld = computeReadiness("quads", hoursAgo(36), true, NOW, veryOldBirthYear);
      const extreme = computeReadiness("quads", hoursAgo(36), true, NOW, extremeBirthYear);
      expect(veryOld).toBeCloseTo(extreme, 5); // both clamped to the same max multiplier
    });
  });
});
