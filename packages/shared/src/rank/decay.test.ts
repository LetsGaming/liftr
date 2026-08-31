import { describe, expect, it } from "vitest";
import { computeCurrentBand, RANK_DECAY_GRACE_DAYS, RANK_DECAY_WINDOW_DAYS } from "./decay.js";

const peak = { tier: "gold" as const, division: 2 as const, lp: 40 };

describe("computeCurrentBand", () => {
  it("returns peak unchanged within the grace period", () => {
    expect(computeCurrentBand(peak, 0)).toEqual(peak);
    expect(computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS)).toEqual(peak);
  });

  it("decays partially mid-window", () => {
    const midway = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS / 2);
    // Strictly between peak and the floor (gold-III/0), never at either boundary mid-window.
    expect(midway.tier === "gold").toBe(true);
    const floor = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(midway).not.toEqual(peak);
    expect(midway).not.toEqual(floor);
  });

  it("floors at division III / 0 LP of the peak's own tier, never lower, past the full window", () => {
    const floor = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(floor).toEqual({ tier: "gold", division: 3, lp: 0 });

    const wayPastWindow = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS + 500);
    expect(wayPastWindow).toEqual(floor); // does not decay below the floor
  });

  it("never crosses into the tier below peak's tier, even at the very top of the peak band", () => {
    const topOfDiamond = { tier: "diamond" as const, division: 1 as const, lp: 100 };
    const floor = computeCurrentBand(topOfDiamond, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS + 1000);
    expect(floor).toEqual({ tier: "diamond", division: 3, lp: 0 });
  });

  it("reverses to exactly peak the instant daysSinceLastTrained resets to 0, not gradually", () => {
    const decayed = computeCurrentBand(peak, RANK_DECAY_GRACE_DAYS + RANK_DECAY_WINDOW_DAYS);
    expect(decayed).not.toEqual(peak);
    expect(computeCurrentBand(peak, 0)).toEqual(peak);
  });
});
