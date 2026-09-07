import { describe, expect, it } from "vitest";
import { createTestDb, insertTestExercise } from "../helpers/testDb.js";
import {
  bandOrdinal,
  progressiveOverloadSessions,
  ratioToWeightKg,
  runGrind,
  seedRealAnchorStandards,
  tierEntryRatio,
  type GrindTraceEntry,
} from "../helpers/rankGrindSimulator.js";

/**
 * Rank-system balance testing. Unlike tests/shared/rank/*.test.ts (which unit-test the pure
 * math functions in isolation), these run realistic multi-session lifter grinds through the
 * REAL production sync pipeline (`applySyncBatch`) — the point is answering "does the rank
 * ladder pace well for a real lifter's real training," not "is this one formula correct."
 *
 * Pacing assertions read `peakTier`/`peakDivision` (the timeless, decay-immune measure), not
 * `tier`/`division` (the *displayed current* band) — see rankGrindSimulator.ts's GrindTraceEntry
 * doc comment for why: these grinds are dated in the past to simulate months/years of training
 * quickly, and `recomputeRankForExercise` computes decay against the real wall-clock date the
 * test actually runs on, not simulated "now". Reading `tier`/`division` here would silently
 * measure decay-since-the-test-ran instead of the pacing question these tests actually ask.
 *
 * Bounds below are deliberately generous (found-in-practice numbers, not hand-guessed targets)
 * — they're regression guards against a future balance change making the ladder wildly too fast
 * or too slow, not an assertion that today's exact pacing is "correct" (there's no documented
 * target pace for the tier ladder, unlike XP leveling which has one — see
 * docs/superpowers/specs/2026-09-06-xp-rank-balancing-design.md). If you're deliberately
 * retuning the curve, update these bounds; if a bound fails unexpectedly, that's the signal this
 * suite exists to catch.
 */

const BODYWEIGHT_KG = 80;
const START_DATE = new Date("2024-01-01T10:00:00Z");

function peakOrdinal(entry: GrindTraceEntry): number | null {
  if (entry.peakTier == null || entry.peakDivision == null) return null;
  return bandOrdinal(entry.peakTier, entry.peakDivision);
}

async function setupGrindExercise(db: Awaited<ReturnType<typeof createTestDb>>) {
  const ex = await insertTestExercise(db, { slug: `bal-squat-${Math.random().toString(36).slice(2)}`, movementPattern: "squat" });
  await seedRealAnchorStandards(db, ex.id, "back-squat");
  return ex;
}

describe("rank balance: realistic progression pacing", () => {
  it("a beginner (starts well below Initiate) reaches Apprentice and Trainee within realistic timeframes, never instantly", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 120,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "initiate") * 0.7,
      targetRatio: tierEntryRatio("back-squat", "lifter"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.015,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const firstApprentice = trace.find((e) => e.peakTier === "apprentice");
    const firstTrainee = trace.find((e) => e.peakTier === "trainee");
    expect(firstApprentice, "never reached Apprentice within 120 sessions — pacing far too slow").toBeDefined();
    expect(firstTrainee, "never reached Trainee within 120 sessions — pacing far too slow").toBeDefined();
    // not suspiciously instant (found-in-practice: session 20) and not absurdly slow (found: session 20/39)
    expect(firstApprentice!.sessionIndex).toBeGreaterThan(2);
    expect(firstApprentice!.sessionIndex).toBeLessThan(60);
    expect(firstTrainee!.sessionIndex).toBeGreaterThan(firstApprentice!.sessionIndex);
    expect(firstTrainee!.sessionIndex).toBeLessThan(90);
  });

  it("an advanced lifter (starts near Lifter tier) reaches Elite within a realistic multi-month timeframe", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 150,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "lifter") * 0.9,
      targetRatio: tierEntryRatio("back-squat", "expert"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.015,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const firstElite = trace.find((e) => e.peakTier === "elite");
    expect(firstElite, "never reached Elite within 150 sessions from a Lifter-tier start").toBeDefined();
    expect(firstElite!.sessionIndex).toBeGreaterThan(20); // not instant from an already-strong start
    expect(firstElite!.sessionIndex).toBeLessThan(120);
  });

  it("a pro lifter (starts at Elite entry) can reach Apex without needing an implausible number of sessions", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 150,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "elite"),
      targetRatio: tierEntryRatio("back-squat", "apex") * 1.15,
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.015,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const firstApex = trace.find((e) => e.peakTier === "apex");
    expect(firstApex, "an Elite-starting lifter never reached Apex within 150 sessions — the top tier may be uncrossable in practice").toBeDefined();
    expect(firstApex!.sessionIndex).toBeGreaterThan(10); // Apex is "one real milestone" — must cost more than a handful of sessions
  });

  it("no single session ever advances peak by more than one whole tier — climbing is always gradual, never a multi-tier skip", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    // A wide-range, fairly fast grind — the scenario most likely to expose a multi-tier skip if
    // one were possible, since it climbs the whole ladder in relatively few sessions.
    const sessions = progressiveOverloadSessions({
      sessionCount: 200,
      sessionsPerWeek: 4,
      startRatio: tierEntryRatio("back-squat", "initiate") * 0.5,
      targetRatio: tierEntryRatio("back-squat", "apex") * 1.2,
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.025,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const TIER_INDEX = ["initiate", "apprentice", "trainee", "athlete", "lifter", "advanced", "elite", "expert", "apex"];
    let prevTierIndex = trace[0]!.peakTier ? TIER_INDEX.indexOf(trace[0]!.peakTier!) : -1;
    for (const entry of trace) {
      if (entry.peakTier == null) continue;
      const tierIndex = TIER_INDEX.indexOf(entry.peakTier);
      if (prevTierIndex >= 0) {
        expect(
          tierIndex - prevTierIndex,
          `session ${entry.sessionIndex} jumped from tier index ${prevTierIndex} to ${tierIndex} (${entry.peakTier}) in one recompute`,
        ).toBeLessThanOrEqual(1);
      }
      prevTierIndex = tierIndex;
    }
  });

  it("a genuinely first-ever session (nothing to corroborate against yet) never establishes a peak by itself", async () => {
    // Documents real, slightly surprising behavior: ratchetPeak's `if (!isCorroborated) return
    // storedPeak` fires on session 1 too (storedPeak is null, isCorroborated is necessarily
    // false with only one day of history) — so peak stays null until a SECOND, separate day
    // matches or exceeds it. The CURRENT displayed band still resolves normally from session 1
    // (see the `tier`/`division` fields), only the *peak* snapshot waits. This contradicts
    // rankService.ts's own comment ("storedPeak is null ... which ratchetPeak treats as 'current
    // always becomes peak'") — that comment is stale relative to the actual corroboration-gated
    // implementation; worth a doc fix independent of this test.
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 1,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "apprentice"),
      targetRatio: tierEntryRatio("back-squat", "apprentice"),
      bodyweightKg: BODYWEIGHT_KG,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    expect(trace[0]!.peakTier).toBeNull();
    expect(trace[0]!.tier).toBe("apprentice"); // current still resolves normally
  });

  it("a stronger starting profile corroborates to a stronger peak than a weaker starting profile", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);

    const weakerRatio = tierEntryRatio("back-squat", "apprentice");
    const strongerRatio = tierEntryRatio("back-squat", "advanced");
    const weight = (ratio: number) => ratioToWeightKg(ratio, BODYWEIGHT_KG, 5);

    // Two sessions at the SAME weight, on separate days — the minimum needed to actually
    // corroborate a peak (see the test above); a single session can't be compared at all.
    const weakerTrace = await runGrind(
      db,
      ex.id,
      [
        { dayOffset: 0, weightKg: weight(weakerRatio), reps: 5 },
        { dayOffset: 2, weightKg: weight(weakerRatio), reps: 5 },
      ],
      START_DATE,
    );

    const ex2 = await setupGrindExercise(db);
    const strongerTrace = await runGrind(
      db,
      ex2.id,
      [
        { dayOffset: 0, weightKg: weight(strongerRatio), reps: 5 },
        { dayOffset: 2, weightKg: weight(strongerRatio), reps: 5 },
      ],
      START_DATE,
    );

    const weakerOrdinal = peakOrdinal(weakerTrace[1]!)!;
    const strongerOrdinal = peakOrdinal(strongerTrace[1]!)!;
    expect(strongerOrdinal).toBeGreaterThan(weakerOrdinal);
  });
});

describe("rank balance: structural invariants over a long, realistic grind", () => {
  it("peak never regresses, even across sessions with a temporarily lighter/weaker set (an off day)", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);

    const climbing = progressiveOverloadSessions({
      sessionCount: 60,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "apprentice"),
      targetRatio: tierEntryRatio("back-squat", "lifter"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.03,
    });
    // Splice in a handful of deliberately weaker "off day" sessions partway through — a real
    // lifter's training is not monotonic; peak must still never regress.
    const withOffDays = climbing.map((s, i) =>
      i === 20 || i === 21 || i === 40 ? { ...s, weightKg: Math.round((s.weightKg * 0.7) / 2.5) * 2.5 } : s,
    );

    const trace = await runGrind(db, ex.id, withOffDays, START_DATE);

    let maxSeenOrdinal = -1;
    for (const entry of trace) {
      const ord = peakOrdinal(entry);
      if (ord == null) continue;
      expect(ord, `peak regressed at session ${entry.sessionIndex} (${entry.peakTier}/${entry.peakDivision})`).toBeGreaterThanOrEqual(
        maxSeenOrdinal,
      );
      maxSeenOrdinal = Math.max(maxSeenOrdinal, ord);
    }
    expect(maxSeenOrdinal).toBeGreaterThan(-1); // sanity: a peak was actually established at some point
  });

  it("the displayed current band's ordinal position never exceeds the stored peak's", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 80,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "trainee"),
      targetRatio: tierEntryRatio("back-squat", "advanced"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.02,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    for (const entry of trace) {
      const peakOrd = peakOrdinal(entry);
      if (peakOrd == null) continue;
      const currentOrd = bandOrdinal(entry.tier, entry.division);
      expect(
        currentOrd,
        `session ${entry.sessionIndex}: current (${entry.tier}/${entry.division}) exceeded peak (${entry.peakTier}/${entry.peakDivision})`,
      ).toBeLessThanOrEqual(peakOrd);
    }
  });

  it("a realistic-cadence progressive-overload grind never trips the plausibility gate", async () => {
    // rate=0.015 over 100+ sessions matches the beginner/advanced/pro profiles validated above —
    // slow enough that the 2.5kg plate rounding naturally produces repeat weeks (and therefore
    // corroboration) before the gap between "current session" and "stored peak" can grow past
    // the 40% improbable-jump threshold. See the finding below for what happens when it's faster.
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 100,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "initiate") * 0.8,
      targetRatio: tierEntryRatio("back-squat", "elite"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.015,
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const flagged = trace.filter((e) => e.plausibilityReason != null);
    expect(flagged, `realistic training got flagged: ${JSON.stringify(flagged.slice(0, 3))}`).toHaveLength(0);
  });

  /**
   * FINDING (balance): a lifter who genuinely improves EVERY session without ever repeating a
   * weight can get their own peak "stuck" — corroboration requires a SECOND separate day to
   * match/exceed a candidate band before peak advances at all (see the "first-ever session"
   * test above), so a continuously-increasing weight never gives any earlier day a chance to
   * catch up to the current one. Peak then freezes at whatever band the first few sessions
   * happened to share (before the gains got large enough to move to a new band), while the
   * *displayed current* and the underlying e1RM keep climbing. Separately, the "improbable jump"
   * plausibility heuristic compares THIS session's ratio against the STORED (now-stale) peak
   * ratio — once that gap exceeds 40% (JUMP_FINE_THRESHOLD), purely honest, continuous progress
   * starts getting discounted/flagged as if it were fabricated.
   *
   * This is a real interaction between two independently-reasonable mechanisms (corroboration
   * requiring a repeat; plausibility comparing against stored peak) that produces a false
   * positive for a legitimate training pattern (classic novice linear progression — e.g.
   * Starting Strength's literal +2.5kg every single workout, no plateau, for weeks). It is not a
   * simulator artifact: reproduced here with the exact production pipeline and real 2.5kg plate
   * increments. Whether this needs a fix (e.g. comparing against the session immediately prior
   * instead of / in addition to stored peak, or widening the corroboration window) is a product
   * balance call, not something this test suite decides — it exists to make the interaction
   * visible and to catch it if the gap between the two mechanisms widens further.
   */
  it("[FINDING] fast, never-repeating novice-linear-progression can false-positive the improbable-jump plausibility flag", async () => {
    const db = createTestDb();
    const ex = await setupGrindExercise(db);
    const sessions = progressiveOverloadSessions({
      sessionCount: 15,
      sessionsPerWeek: 3,
      startRatio: tierEntryRatio("back-squat", "initiate") * 0.8,
      targetRatio: tierEntryRatio("back-squat", "elite"),
      bodyweightKg: BODYWEIGHT_KG,
      rate: 0.02, // fast enough that early sessions rarely round to a repeated 2.5kg weight
    });
    const trace = await runGrind(db, ex.id, sessions, START_DATE);

    const flagged = trace.filter((e) => e.plausibilityReason === "improbable_jump");
    expect(
      flagged.length,
      "expected this exact interaction to reproduce — if it's 0, the finding may have been fixed (great, update this test) or the harness/curve drifted (check before deleting)",
    ).toBeGreaterThan(0);
    // every flagged session here was a smaller, plausible weekly increment (2.5kg steps) — never
    // an actual outlandish jump — which is exactly what makes this a false positive, not a
    // correct catch.
    for (const e of flagged) {
      expect(e.weightKg).toBeLessThan(70); // nowhere near CEILING_MULTIPLE territory
    }
  });
});
