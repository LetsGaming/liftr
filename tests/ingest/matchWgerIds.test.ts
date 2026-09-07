import { describe, expect, it } from "vitest";
import { stem, tokenize, tokenOverlapScore, FUZZY_ACCEPT_THRESHOLD } from "~ingest/matchWgerIds.js";

describe("stem", () => {
  it("strips a trailing 's' from a plural longer than 3 characters", () => {
    expect(stem("dips")).toBe("dip");
    expect(stem("curls")).toBe("curl");
  });

  it("leaves a word ending in 'ss' untouched", () => {
    expect(stem("press")).toBe("press");
  });

  it("leaves a short word (length <= 3) untouched even if it ends in 's'", () => {
    expect(stem("abs")).toBe("abs");
  });

  it("leaves a non-plural word untouched", () => {
    expect(stem("bench")).toBe("bench");
  });
});

describe("tokenize", () => {
  it("lowercases, strips punctuation, splits on whitespace/hyphens, and stems each token", () => {
    expect(tokenize("Ring Dips")).toEqual(new Set(["ring", "dip"]));
  });

  it("strips parentheses content markers but keeps the words inside", () => {
    expect(tokenize("Row (Barbell)")).toEqual(new Set(["row", "barbell"]));
  });

  it("splits hyphenated compounds into separate tokens", () => {
    expect(tokenize("Incline Bench Press")).toEqual(new Set(["incline", "bench", "press"]));
    expect(tokenize("Sumo-Deadlift")).toEqual(new Set(["sumo", "deadlift"]));
  });
});

describe("tokenOverlapScore", () => {
  it("scores an exact-token match at 1", () => {
    expect(tokenOverlapScore("Barbell Curl", "Barbell Curl")).toBe(1);
  });

  it("scores unrelated names at 0", () => {
    expect(tokenOverlapScore("Barbell Curl", "Leg Press")).toBe(0);
  });

  it("rewards wger's name fully containing curated's shorter name plus one qualifier word", () => {
    // curated "Incline Bench Press" fully contained in wger's "Incline Bench Press - Barbell"
    // (an extra "barbell" qualifier) — containment-anchored to curated's own token count.
    const score = tokenOverlapScore("Incline Bench Press", "Incline Bench Press - Barbell");
    expect(score).toBeGreaterThanOrEqual(FUZZY_ACCEPT_THRESHOLD);
  });

  it("does not reward containment when the candidate adds more than one extra qualifier word", () => {
    // "Barbell Curl" is a strict subset of "Barbell Reverse Wrist Curl" token-wise, but that's
    // two extra words (reverse, wrist) — a different exercise, not a fuller name for the same one.
    const score = tokenOverlapScore("Barbell Curl", "Barbell Reverse Wrist Curl");
    expect(score).toBeLessThan(FUZZY_ACCEPT_THRESHOLD);
  });

  it("is asymmetric: only rewards the candidate for containing every curated token, never the reverse", () => {
    // A short generic candidate ("Bench Press") must not falsely max out containment against a
    // more specific curated name ("Incline Bench Press") just by having 2 of its words present.
    const forward = tokenOverlapScore("Incline Bench Press", "Bench Press");
    const reverse = tokenOverlapScore("Bench Press", "Incline Bench Press");
    expect(forward).toBeLessThan(FUZZY_ACCEPT_THRESHOLD);
    expect(reverse).toBeGreaterThanOrEqual(forward);
  });

  it("closes the singular/plural gap via stemming", () => {
    const score = tokenOverlapScore("Ring Dip", "Ring Dips");
    expect(score).toBe(1);
  });
});
