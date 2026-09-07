import { describe, expect, it } from "vitest";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import { upsertBodyweightLog } from "~server/repositories/bodyweightRepository.js";
import {
  bandOrdinal,
  ratioToWeightKg,
  runGrind,
  seedRealAnchorStandards,
  tierEntryRatio,
} from "../helpers/rankGrindSimulator.js";

/**
 * Anti-cheat testing for the rank engine, run end-to-end through the real production sync
 * pipeline (`applySyncBatch`) rather than calling the plausibility heuristic functions in
 * isolation (tests/shared/rank/plausibility.test.ts already covers those directly) — the
 * question here is whether an actual attack pattern gets caught by the FULL pipeline (data-entry
 * caps + plausibility gate + peak eligibility + corroboration), not whether one formula is
 * correct in isolation.
 */

const BODYWEIGHT_KG = 80;
const START_DATE = new Date("2024-01-01T10:00:00Z");

async function setupGrindExercise(db: Awaited<ReturnType<typeof createTestDb>>) {
  const ex = await insertTestExercise(db, { slug: `cheat-squat-${Math.random().toString(36).slice(2)}`, movementPattern: "squat" });
  await seedRealAnchorStandards(db, ex.id, "back-squat");
  // Explicit, so every test's ratio math matches BODYWEIGHT_KG exactly rather than silently
  // falling back to rankService.ts's FALLBACK_BODYWEIGHT_KG (75, not 80) when no log exists.
  await upsertBodyweightLog(db, "2024-01-01", BODYWEIGHT_KG);
  return ex;
}

function round2_5(kg: number): number {
  return Math.round(kg / 2.5) * 2.5;
}

/** Weight for a session confidently WITHIN `tier` (not right at its boundary) — a small margin
 *  above the tier's exact entry ratio, so 2.5kg plate rounding can't undershoot into the tier
 *  below. Use this instead of `ratioToWeightKg(tierEntryRatio(...), ...)` directly whenever a
 *  test's assertions depend on landing in a SPECIFIC named tier. */
function weightConfidentlyIn(tier: Parameters<typeof tierEntryRatio>[1], bodyweightKg: number, reps = 5): number {
  return round2_5(ratioToWeightKg(tierEntryRatio("back-squat", tier) * 1.03, bodyweightKg, reps));
}

describe("anti-cheat: sudden implausible jump", () => {
  it("an outlandish single-session weight jump is flagged, doesn't advance peak, and doesn't create a PR", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const baseWeight = weightConfidentlyIn("trainee", BODYWEIGHT_KG);

    await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: baseWeight, reps: 5 },
        { dayOffset: 2, weightKg: baseWeight, reps: 5 },
      ],
      START_DATE,
    );

    // 3x the established weight in one session — no real single-session jump like this exists;
    // still under the hard MAX_PLAUSIBLE_WEIGHT_KG=500 data-entry cap, so it reaches the
    // plausibility heuristic instead of being rejected outright at the door.
    const [cheatEntry] = await runGrind(db, ex.id, [{ dayOffset: 4, weightKg: baseWeight * 3, reps: 5 }], START_DATE);

    expect(cheatEntry!.plausibilityReason).toBe("improbable_jump");
    expect(cheatEntry!.newPr).toBe(false);
    expect(cheatEntry!.peakTier).toBe("trainee"); // peak still reflects the honest baseline
  });

  it("a weight beyond MAX_PLAUSIBLE_WEIGHT_KG is rejected outright at data entry, before plausibility even runs", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const [entry] = await runGrind(db, ex.id, [{ dayOffset: 0, weightKg: 501, reps: 5 }], START_DATE);
    expect(entry!.rejected).toBe(true);
  });

  it("a ratio far beyond the Apex threshold is flagged as exceeds_ceiling, a stricter/hard-floor reason than a mere jump", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    // Land the ratio at 2x the Apex threshold on the very first-ever session — no stored peak to
    // compare a "jump" against yet, but the ceiling check is absolute (ratio vs. Apex threshold),
    // not relative to history, so it still fires.
    const apexRatio = tierEntryRatio("back-squat", "apex");
    const weight = round2_5(ratioToWeightKg(apexRatio * 2, BODYWEIGHT_KG, 5));
    const [entry] = await runGrind(db, ex.id, [{ dayOffset: 0, weightKg: weight, reps: 5 }], START_DATE);
    expect(entry!.plausibilityReason).toBe("exceeds_ceiling");
    expect(entry!.newPr).toBe(false);
  });
});

describe("anti-cheat: corroboration gaming", () => {
  it("a believable (unflagged) but unprecedented jump does not become peak until a SECOND, separate day matches or exceeds it", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const baseWeight = weightConfidentlyIn("trainee", BODYWEIGHT_KG);
    await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: baseWeight, reps: 5 },
        { dayOffset: 2, weightKg: baseWeight, reps: 5 },
      ],
      START_DATE,
    );

    // A believable jump — comfortably under JUMP_FINE_THRESHOLD (0.4), so genuinely not flagged.
    const spikeWeight = round2_5(baseWeight * 1.25);
    const [spike] = await runGrind(db, ex.id, [{ dayOffset: 4, weightKg: spikeWeight, reps: 5 }], START_DATE);
    expect(spike!.plausibilityReason).toBeNull();
    expect(spike!.peakTier).toBe("trainee"); // plausible, but not yet corroborated -> not promoted

    // A second attempt at the exact same value later THE SAME calendar day does not corroborate
    // it — rankService.ts's corroboration scan explicitly skips `dayKey === bestDayKey`.
    const [sameDayRepeat] = await runGrind(db, ex.id, [{ dayOffset: 4, weightKg: spikeWeight, reps: 5 }], START_DATE);
    expect(sameDayRepeat!.peakTier).toBe("trainee"); // still not promoted

    // A genuinely separate day matching/exceeding it DOES corroborate — this is the intended,
    // non-gamed path to promotion, included here to prove the previous two assertions weren't
    // just "corroboration is broken." Compare by ordinal, not tier name — a ~25% jump may still
    // land within the same tier at a higher division, which is a real promotion even without
    // crossing a tier boundary.
    const [corroborated] = await runGrind(db, ex.id, [{ dayOffset: 6, weightKg: spikeWeight, reps: 5 }], START_DATE);
    expect(bandOrdinal(corroborated!.peakTier!, corroborated!.peakDivision!)).toBeGreaterThan(
      bandOrdinal(spike!.peakTier!, spike!.peakDivision!),
    );
  });
});

describe("anti-cheat: session-spam gaming", () => {
  it("spamming many sessions on the SAME calendar day at a much higher weight never corroborates a peak by itself", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const baseWeight = weightConfidentlyIn("trainee", BODYWEIGHT_KG);
    await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: baseWeight, reps: 5 },
        { dayOffset: 2, weightKg: baseWeight, reps: 5 },
      ],
      START_DATE,
    );

    // A believable-magnitude spike (won't itself get flagged), repeated 10 times, all on one
    // single calendar day — "spamming sessions" to try to manufacture the appearance of
    // corroboration through sheer repetition rather than a genuinely separate occasion.
    const spikeWeight = round2_5(baseWeight * 1.25);
    const spamSessions = Array.from({ length: 10 }, () => ({ dayOffset: 4, weightKg: spikeWeight, reps: 5 }));
    const trace = await runGrind(db, ex.id, spamSessions, START_DATE);

    expect(trace.every((e) => e.peakTier === "trainee"), "same-day repetition alone must never corroborate a peak").toBe(true);
  });

  it("a genuinely first-ever session cannot self-corroborate no matter how many working sets it contains", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const weight = round2_5(ratioToWeightKg(tierEntryRatio("back-squat", "advanced"), BODYWEIGHT_KG, 5));
    // One session, but a large working-set count — still one calendar day, one occasion.
    const [entry] = await runGrind(db, ex.id, [{ dayOffset: 0, weightKg: weight, reps: 5, setCount: 8 }], START_DATE);
    expect(entry!.peakTier).toBeNull();
  });
});

describe("anti-cheat: bodyweight/ratio manipulation", () => {
  /**
   * FINDING (anti-cheat gap, more severe than "a subtle manipulation slips through"): the jump
   * check is STRUCTURALLY BLIND to bodyweight manipulation at any magnitude, not just small
   * ones. syncService.ts computes both `sessionBestRatio` (this session's load / bodyweightKg)
   * and `storedPeakRatio` (rank.peakE1rm / bodyweightKg) using the SAME `bodyweightKg` —
   * `getCurrentBodyweightKg(db)`'s CURRENT reading, not the bodyweight the peak was actually
   * achieved at. If the lifted weight is unchanged and only bodyweight is manipulated, both
   * sides of the jump comparison scale by the identical factor and the fraction is unchanged —
   * jumpFraction stays ~0 regardless of how extreme the bodyweight lie is. Verified here with an
   * 80kg -> 30kg manipulation (a blatant, not-remotely-subtle 50kg lie): completely unflagged.
   *
   * The only thing that can still catch a bodyweight manipulation is the CEILING check, since it
   * compares the absolute ratio against a fixed Apex threshold rather than against stored peak —
   * but for a lifter already mid-ladder, that requires an obviously-fake bodyweight (see the
   * second test below: this exercise's numbers need bodyweight under ~18kg to trip it). A
   * realistic "dieted down 10-15kg before weigh-in" manipulation is invisible to both checks.
   *
   * Documented here as a regression trip-wire and a product-decision flag, not something this
   * test suite fixes on its own — e.g. computing storedPeakRatio against the bodyweight recorded
   * AT peakAchievedAt instead of today's would close this, at the cost of needing that historical
   * bodyweight to be available/reliable itself.
   */
  it("[FINDING] the jump check is blind to bodyweight manipulation at any magnitude — both sides of the comparison use today's (possibly manipulated) bodyweight", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const baseWeight = weightConfidentlyIn("trainee", BODYWEIGHT_KG);
    await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: baseWeight, reps: 5 },
        { dayOffset: 2, weightKg: baseWeight, reps: 5 },
      ],
      START_DATE,
    );

    // Same lifted weight as the established baseline — only bodyweight changes, and blatantly:
    // an 80kg -> 30kg (62.5%) drop, nowhere near a subtle understatement.
    await upsertBodyweightLog(db, "2024-01-06", 30);
    const [manipulated] = await runGrind(db, ex.id, [{ dayOffset: 5, weightKg: baseWeight, reps: 5 }], START_DATE);

    expect(
      manipulated!.plausibilityReason,
      "if this is no longer null, the gap may have been closed (great — update/remove this test) or the harness/curve drifted",
    ).toBeNull();
  });

  it("only an obviously-fake bodyweight (near the exercise's ceiling-crossing point) still gets caught, and only via the ceiling check, not because manipulation itself is detected", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const baseWeight = weightConfidentlyIn("trainee", BODYWEIGHT_KG);
    await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: baseWeight, reps: 5 },
        { dayOffset: 2, weightKg: baseWeight, reps: 5 },
      ],
      START_DATE,
    );

    // Bodyweight low enough that even the SAME lifted weight now reads as exceeding this
    // exercise's Apex-threshold-based ceiling (found empirically for this scenario: ~18kg).
    await upsertBodyweightLog(db, "2024-01-06", 12);
    const [manipulated] = await runGrind(db, ex.id, [{ dayOffset: 5, weightKg: baseWeight, reps: 5 }], START_DATE);

    expect(manipulated!.plausibilityReason).toBe("exceeds_ceiling");
    expect(manipulated!.peakTier).toBe("trainee"); // still didn't promote off it
  });
});
