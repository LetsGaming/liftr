import { describe, expect, it } from "vitest";
import {
  applySessionRecoveryGain,
  computeCurrentBand,
  RANK_DECAY_GRACE_DAYS,
  RANK_DECAY_WINDOW_DAYS,
  type RankBand,
} from "./decay.js";
import { ordinal } from "./tiers.js";

// "advanced" and "elite" both kept the old 3-division (III/II/I) shape, so they stand in for the
// old "gold"/"diamond" fixture tiers with identical division semantics.
const peak = { tier: "advanced" as const, division: 2 as const, lp: 40 };

describe("computeCurrentBand", () => {
  it("returns peak unchanged within the grace period", () => {
    expect(computeCurrentBand(peak, 0)).toEqual(peak);
    expect(computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS)).toEqual(peak);
  });

  it("decays partially mid-window", () => {
    const midway = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS / 2);
    // Strictly between peak and the floor (advanced-III/0), never at either boundary mid-window.
    expect(midway.tier === "advanced").toBe(true);
    const floor = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(midway).not.toEqual(peak);
    expect(midway).not.toEqual(floor);
  });

  it("floors at division III / 0 LP of the peak's own tier, never lower, past the full window", () => {
    const floor = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(floor).toEqual({ tier: "advanced", division: 3, lp: 0 });

    const wayPastWindow = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS + 500);
    expect(wayPastWindow).toEqual(floor); // does not decay below the floor
  });

  it("never crosses into the tier below peak's tier, even at the very top of the peak band", () => {
    const topOfElite = { tier: "elite" as const, division: 1 as const, lp: 100 };
    const floor = computeCurrentBand(topOfElite, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS + 1000);
    expect(floor).toEqual({ tier: "elite", division: 3, lp: 0 });
  });

  it("reverses to exactly peak the instant daysSinceLastTrained resets to 0, not gradually", () => {
    const decayed = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(decayed).not.toEqual(peak);
    expect(computeCurrentBand(peak, 0)).toEqual(peak);
  });
});

describe("applySessionRecoveryGain", () => {
  it("returns peak unchanged when current already equals peak", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    expect(applySessionRecoveryGain(peak, peak)).toEqual(peak);
  });

  it("returns peak unchanged when current is already above peak (peak just advanced)", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    const current = { tier: "advanced" as const, division: 1, lp: 50 }; // stronger than peak
    expect(applySessionRecoveryGain(peak, current)).toEqual(peak);
  });

  it("closes a worst-case (fully floored) gap within 5 sessions, never overshooting peak", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 }; // top of a 3-division tier
    let current: RankBand = { tier: "advanced", division: 3, lp: 0 }; // fully floored
    for (let session = 0; session < 5; session++) {
      current = applySessionRecoveryGain(peak, current);
    }
    expect(current).toEqual(peak);
  });

  it("does not fully close a worst-case gap in fewer than 4 sessions (the buff isn't infinite)", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 };
    let current: RankBand = { tier: "advanced", division: 3, lp: 0 };
    for (let session = 0; session < 3; session++) {
      current = applySessionRecoveryGain(peak, current);
    }
    expect(current).not.toEqual(peak);
  });

  it("never moves current past peak, even mid-climb", () => {
    const peak = { tier: "advanced" as const, division: 2, lp: 40 };
    const current = { tier: "advanced" as const, division: 2, lp: 38 }; // 2 LP from peak
    const result = applySessionRecoveryGain(peak, current);
    expect(ordinal(result.tier, result.division) * 100 + result.lp).toBeLessThanOrEqual(
      ordinal(peak.tier, peak.division) * 100 + peak.lp,
    );
  });

  it("gives a smaller absolute gain for a smaller initial gap than for the worst case", () => {
    const peak = { tier: "advanced" as const, division: 1, lp: 100 };
    const nearlyThere = applySessionRecoveryGain(peak, { tier: "advanced", division: 1, lp: 90 });
    const farAway = applySessionRecoveryGain(peak, { tier: "advanced", division: 3, lp: 0 });
    const nearGain = 100 - 90; // trivially small remaining gap closes in well under 1 full gain unit
    const farGain =
      (ordinal(farAway.tier, farAway.division) * 100 + farAway.lp) -
      (ordinal("advanced", 3) * 100 + 0);
    expect(farGain).toBeGreaterThan(nearGain);
  });
});
