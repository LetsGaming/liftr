import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runPrs, runStandards, syncCardioStandards, type LiftrDb } from "@liftr/db";
import { buildCardioStandards } from "@liftr/shared";
import { writeJsonSetting } from "~server/repositories/settingsRepository.js";
import { insertRun, insertRunPoints, type NewRun } from "~server/repositories/runRepository.js";
import { findRunRankByBucket, findAllRunRanks } from "~server/repositories/runRankRepository.js";
import { recomputeAllCardioRanks, recomputeRunRank } from "~server/services/runRankService.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

/** category "5k" thresholds (male), speed in m/s. distanceM=5000 is the exact category distance,
 *  so runRankValue's Riegel adjustment is a no-op (ratio=1) and speedMps = distanceM / durationS
 *  exactly — lets tests reason about durationS directly without hand-computing Riegel exponents. */
async function seedStandards() {
  await db.insert(runStandards).values([
    { category: "5k", sex: "male", tier: "apprentice", division: 3, threshold: 3.0, trust: "real" },
    { category: "5k", sex: "male", tier: "apprentice", division: 2, threshold: 3.5, trust: "real" },
    { category: "5k", sex: "male", tier: "athlete", division: 3, threshold: 4.5, trust: "real" },
  ]);
}

/** Logs one rank-eligible (GPS-tracked, non-manual) 5k run at the given pace/day. */
async function logRun(durationS: number, startedAt: Date = new Date(), overrides: Partial<NewRun> = {}) {
  const run = await insertRun(db, OWNER_USER_ID, {
    source: "gpx",
    activityType: "run",
    name: null,
    startedAt,
    clientId: `run-${Math.random().toString(36).slice(2, 8)}`,
    distanceM: 5000,
    durationS,
    avgPaceSPerKm: (durationS / 5000) * 1000,
    ...overrides,
  });
  await insertRunPoints(db, run.id, [
    { idx: 0, t: startedAt.getTime(), lat: 52.0, lon: 13.0 },
    { idx: 1, t: startedAt.getTime() + durationS * 1000, lat: 52.01, lon: 13.01 },
  ]);
  return run;
}

/** Establishes a corroborated peak the same way rankService.test.ts's helper does: the same
 *  performance logged on two distinct UTC calendar days. `candidateDate` is inserted first
 *  (defaults to "now") so it stays the deterministically-selected `bestRun` among equal values. */
async function establishCorroboratedPeak(durationS: number, candidateDate: Date = new Date()) {
  await logRun(durationS, candidateDate);
  await logRun(durationS, new Date(candidateDate.getTime() - 24 * 60 * 60 * 1000));
}

describe("recomputeRunRank", () => {
  it("returns null when no standards are modeled for the category", async () => {
    await logRun(1500);
    expect(await recomputeRunRank(db, OWNER_USER_ID, "5k", "run")).toBeNull();
  });

  it("returns null when there is no rank-eligible run history for the category", async () => {
    await seedStandards();
    expect(await recomputeRunRank(db, OWNER_USER_ID, "5k", "run")).toBeNull();
  });

  it("resolves a tier from the best logged run's Riegel-adjusted speed (first-ever, no storedPeak)", async () => {
    await seedStandards();
    // 5000/1500 = 3.333 m/s -> apprentice/III (>=3.0, <3.5), lp = (3.333-3.0)/(3.5-3.0)*100 ~ 66.7
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result).not.toBeNull();
    expect(result!.tier).toBe("apprentice");
    expect(result!.division).toBe(3);
    expect(result!.lp).toBeCloseTo(66.67, 1);
    // First-ever result is uncorroborated (no second distinct day yet) -> no peak, no rank-up.
    expect(result!.rankedUp).toBe(false);
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.peakTier).toBeNull();
  });

  it("a same-UTC-day repeat stays uncorroborated: no peak lock-in, no rank event", async () => {
    await seedStandards();
    // Pinned to UTC midday so the +1h second run below can never cross a UTC calendar-day
    // boundary regardless of what wall-clock time this test happens to run at.
    const today = new Date();
    today.setUTCHours(12, 0, 0, 0);
    await logRun(1500, today);
    await logRun(1500, new Date(today.getTime() + 60 * 60 * 1000)); // same day, an hour later

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result!.rankedUp).toBe(false);
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.peakTier).toBeNull();
  });

  it("a next-day corroborating run locks the peak in and logs a rank-up", async () => {
    await seedStandards();
    await establishCorroboratedPeak(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result!.rankedUp).toBe(true);
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.peakTier).toBe("apprentice");
    expect(row?.peakDivision).toBe(3);
    expect(row?.peakSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("a long gap decays the CURRENT band while leaving storedPeak untouched", async () => {
    await seedStandards();
    // Establish a corroborated apprentice/III peak ~100 days ago (grace=21d + window=60d means
    // a 100-day-old last-trained date is fully past the decay window -> current floors out at
    // apprentice/IV/0, while the stored peak snapshot itself must stay apprentice/III.
    const candidateDate = new Date(Date.now() - 99 * 24 * 60 * 60 * 1000);
    await establishCorroboratedPeak(1500, candidateDate);
    const first = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(first!.rankedUp).toBe(true);

    // Second recompute, no new runs logged — same stale history, so decay now applies.
    const second = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(second!.rankedUp).toBe(false); // peak itself doesn't change on a decay-only recompute
    expect(second!.tier).toBe("apprentice");
    expect(second!.division).toBe(4); // floor of apprentice (TIER_DIVISION_COUNT.apprentice = 4)
    expect(second!.lp).toBe(0);

    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.peakTier).toBe("apprentice");
    expect(row?.peakDivision).toBe(3); // storedPeak untouched by decay
    expect(row?.peakSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("a manual run in the mix is excluded from bestSpeedMps/corroboration entirely", async () => {
    await seedStandards();
    // Legit GPS-tracked run: apprentice/III pace.
    await logRun(1500);
    // Manual run, same category (distance=5000), but a much faster (better) pace that would
    // resolve to "athlete" if it ever reached the rank computation. If this leaks in, the
    // resulting tier would be "athlete" instead of "apprentice".
    await insertRun(db, OWNER_USER_ID, {
      source: "manual",
      activityType: "run",
      name: null,
      startedAt: new Date(),
      clientId: `manual-run-${Math.random().toString(36).slice(2, 8)}`,
      distanceM: 5000,
      durationS: 1000, // 5000/1000 = 5.0 m/s -> would be "athlete" tier
      avgPaceSPerKm: 200,
    });

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result!.tier).toBe("apprentice");
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.bestSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("detects a new speed/time PR on the first-ever computation (PR is independent of peak corroboration)", async () => {
    await seedStandards();
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result!.rankedUp).toBe(false); // uncorroborated, but PR detection doesn't care
    expect(result!.newPr).not.toBeNull();
    expect(result!.newPr!.value).toBeCloseTo(3.333, 2);
  });

  it("does not insert a spurious 'time' PR once >=2 time-PR rows exist and the true best hasn't changed (findBestRunPrByKind kind-direction bug regression)", async () => {
    await seedStandards();

    // Recompute #1: first-ever run, D1=1500s (3.333 m/s) -> inserts time PR value=1500.
    await logRun(1500);
    const first = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(first!.newPr).not.toBeNull();

    // Recompute #2: a genuinely faster run, D2=1400s (3.571 m/s) becomes the new overall best
    // (both speed and time improve together since they're tied to the same run) -> inserts a
    // second time PR row, value=1400. Two "time" rows now exist: {1500, 1400}.
    await logRun(1400);
    const second = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(second!.newPr).not.toBeNull();

    const timePrRowsAfterSecond = await db.query.runPrs.findMany({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.category, "5k"), eq(runPrs.kind, "time")),
    });
    expect(timePrRowsAfterSecond).toHaveLength(2);

    // Recompute #3: an extra run logged that is slower than D2 but faster than D1 (1450s) — it
    // does NOT change which run is the overall best (still the D2=1400s run), so nothing has
    // actually improved. Before the fix, `findBestRunPrByKind(..., "time")`'s desc(value)
    // ordering would incorrectly return the stale D1=1500 row as "existing", and
    // 1400 < 1500 would wrongly look like a new PR on every such call.
    await logRun(1450);
    const third = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(third!.newPr).toBeNull();
    const timePrRowsAfterThird = await db.query.runPrs.findMany({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.category, "5k"), eq(runPrs.kind, "time")),
    });
    expect(timePrRowsAfterThird).toHaveLength(2); // still exactly 2 — no spurious insert
  });

  it("does not record a PR when plausibilityMultiplier is below PR_ELIGIBILITY_FLOOR (0.5)", async () => {
    await seedStandards();
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run", 0.4, null);

    expect(result!.newPr).toBeNull();
  });

  it("uses sex-specific standards when the profile sets one", async () => {
    await db.insert(runStandards).values([
      { category: "5k", sex: "male", tier: "apprentice", division: 3, threshold: 3.0, trust: "real" },
      { category: "5k", sex: "male", tier: "athlete", division: 3, threshold: 50.0, trust: "real" },
      { category: "5k", sex: "female", tier: "apprentice", division: 3, threshold: 1.0, trust: "derived" },
      { category: "5k", sex: "female", tier: "athlete", division: 3, threshold: 3.0, trust: "derived" },
    ]);
    await logRun(1500); // 3.333 m/s

    const maleResult = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(maleResult!.tier).toBe("apprentice"); // below the male athlete threshold of 50

    await writeJsonSetting(db, OWNER_USER_ID, "profile", { sex: "female" });
    const femaleResult = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(femaleResult!.tier).toBe("athlete"); // 3.333 clears the female athlete threshold of 3.0
  });

  it("stores the Riegel-equivalent time (not the raw duration) for an off-distance best run", async () => {
    await db.insert(runStandards).values([
      { category: "10k", sex: "male", tier: "apprentice", division: 3, threshold: 3.0, trust: "real" },
    ]);
    // Same off-distance scenario as the reproduction found via the default dev seed: an
    // 8000m/2480s run buckets into "10k" (nearest category) via non-trivial Riegel adjustment
    // (ratio != 1), so a bug that stores the raw durationS instead of the category-equivalent
    // time is only observable here, never on an exact-category-distance run.
    const startedAt = new Date();
    const run = await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      activityType: "run",
      name: null,
      startedAt,
      clientId: "off-distance-run",
      distanceM: 8000,
      durationS: 2480,
      avgPaceSPerKm: (2480 / 8000) * 1000,
    });
    await insertRunPoints(db, run.id, [
      { idx: 0, t: startedAt.getTime(), lat: 52.0, lon: 13.0 },
      { idx: 1, t: startedAt.getTime() + 2480 * 1000, lat: 52.01, lon: 13.01 },
    ]);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "10k", "run");
    expect(result!.newPr).not.toBeNull();

    // Same formula runRankValue/riegelPredictedTimeS use internally (10k uses the 1.06 exponent).
    const expectedEquivalentTimeS = 2480 * Math.pow(10000 / 8000, 1.06);
    const timePrRow = await db.query.runPrs.findFirst({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.category, "10k"), eq(runPrs.kind, "time")),
    });
    expect(timePrRow?.value).toBeCloseTo(expectedEquivalentTimeS, 0);
    // The bug this regresses: storing the run's raw, un-normalized duration as if it were a real
    // 10K time (2480s = "41:20" — a run that was never actually run at 10K).
    expect(Math.abs((timePrRow?.value ?? 0) - 2480)).toBeGreaterThan(500);
  });

  it("skips a historical run with a non-finite Riegel speed (durationS<=0) instead of letting it poison the category's rank", async () => {
    await seedStandards();
    await logRun(1500); // valid apprentice/III run, 3.333 m/s

    // A degenerate row (durationS=0) that could arise from a malformed GPX/FIT import — Riegel's
    // division makes its speed Infinity, which would otherwise beat any real run and win as
    // `bestRun`/`bestSpeedMps`, poisoning the persisted rank row with a non-finite value.
    const degenerateStartedAt = new Date();
    const degenerateRun = await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      activityType: "run",
      name: null,
      startedAt: degenerateStartedAt,
      clientId: "degenerate-run",
      distanceM: 5000,
      durationS: 0,
      avgPaceSPerKm: null,
    });
    await insertRunPoints(db, degenerateRun.id, [{ idx: 0, t: degenerateStartedAt.getTime(), lat: 52.0, lon: 13.0 }]);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");

    expect(result).not.toBeNull();
    expect(Number.isFinite(result!.lp)).toBe(true);
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.bestSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("keeps separate rows per category (findAllRunRanks sanity)", async () => {
    await seedStandards();
    await db.insert(runStandards).values([
      { category: "10k", sex: "male", tier: "apprentice", division: 3, threshold: 3.0, trust: "real" },
    ]);
    await logRun(1500);
    await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      activityType: "run",
      name: null,
      startedAt: new Date(),
      clientId: "10k-run",
      distanceM: 10000,
      durationS: 3000,
      avgPaceSPerKm: 300,
    }).then(async (run) => {
      await insertRunPoints(db, run.id, [{ idx: 0, t: Date.now(), lat: 52.0, lon: 13.0 }]);
    });

    await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    await recomputeRunRank(db, OWNER_USER_ID, "10k", "run");

    const all = await findAllRunRanks(db, OWNER_USER_ID, "run");
    expect(all.map((r) => r.category).sort()).toEqual(["10k", "5k"]);
  });
});

describe("recomputeRunRank: walk (single-speed, bucket 'all')", () => {
  /** Walk-equivalent of seedStandards() — same shape, "walk" activityType, bucket "all" (walking
   *  has exactly one rank bucket, not five distance categories), deliberately different threshold
   *  values so a test asserting the walk ladder resolved (not the run ladder) is actually
   *  meaningful. */
  async function seedWalkStandards() {
    await db.insert(runStandards).values([
      { activityType: "walk", category: "all", sex: "male", tier: "apprentice", division: 3, threshold: 1.0, trust: "synthetic" },
      { activityType: "walk", category: "all", sex: "male", tier: "apprentice", division: 2, threshold: 1.2, trust: "synthetic" },
      { activityType: "walk", category: "all", sex: "male", tier: "athlete", division: 3, threshold: 1.5, trust: "synthetic" },
    ]);
  }

  /** Distance/duration default clear walking's rank-eligibility floor (>=1000m, >=600s — see
   *  cardioActivities.ts) unless overridden, so most cases don't need to think about the floor. */
  async function logWalk(durationS: number, startedAt: Date = new Date(), distanceM = 5000) {
    const run = await insertRun(db, OWNER_USER_ID, {
      source: "healthconnect",
      activityType: "walk",
      name: null,
      startedAt,
      clientId: `walk-${Math.random().toString(36).slice(2, 8)}`,
      distanceM,
      durationS,
      avgPaceSPerKm: (durationS / distanceM) * 1000,
    });
    await insertRunPoints(db, run.id, [
      { idx: 0, t: startedAt.getTime(), lat: 52.0, lon: 13.0 },
      { idx: 1, t: startedAt.getTime() + durationS * 1000, lat: 52.01, lon: 13.01 },
    ]);
    return run;
  }

  it("resolves against the walk standards (bucket 'all'), not the run standards", async () => {
    await seedStandards(); // run ladder: 5k apprentice starts at 3.0 m/s
    await seedWalkStandards(); // walk ladder: apprentice starts at 1.0 m/s
    await logWalk(3846); // 5000/3846 ~= 1.3 m/s

    const result = await recomputeRunRank(db, OWNER_USER_ID, "all", "walk");
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("apprentice"); // 1.3 m/s sits between apprentice's div 3 and 2

    // The run ladder must be completely untouched by the walk recompute.
    const runRank = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(runRank).toBeUndefined();
  });

  it("uses the raw distance/duration average, no Riegel normalization", async () => {
    await seedWalkStandards();
    // An off-"5k" distance (8000m) at a pace that would be Riegel-adjusted if this were running —
    // walking must NOT adjust it: raw average speed is 8000/6154 ~= 1.3 m/s, same tier as the 5k
    // case above.
    await logWalk(6154, new Date(), 8000);
    const result = await recomputeRunRank(db, OWNER_USER_ID, "all", "walk");
    expect(result).not.toBeNull();
    expect(result!.tier).toBe("apprentice");
  });

  it("below the eligibility floor (< 1000m or < 600s): no rank, XP/streak only", async () => {
    await seedWalkStandards();
    await logWalk(300, new Date(), 500); // both under the floor
    const result = await recomputeRunRank(db, OWNER_USER_ID, "all", "walk");
    expect(result).toBeNull();
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "all", "walk");
    expect(row).toBeUndefined();
  });

  it("exactly at the eligibility floor (1000m, 600s) counts", async () => {
    await seedWalkStandards();
    await logWalk(600, new Date(), 1000);
    const result = await recomputeRunRank(db, OWNER_USER_ID, "all", "walk");
    expect(result).not.toBeNull();
  });

  it("a walk run does not appear in the run ladder's history scan, even at the same distance", async () => {
    await seedStandards();
    await logRun(1500); // a real run at the same 5k distance
    await logWalk(3846); // a walk at the same 5k distance

    const runResult = await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    expect(runResult).not.toBeNull();
    // bestSpeedMps must reflect only the run (5000/1500 ~= 3.333), not be dragged down/up by the
    // walk sharing the same distance.
    const row = await findRunRankByBucket(db, OWNER_USER_ID, "5k", "run");
    expect(row?.bestSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("a walk PR is independent of the run PR", async () => {
    await seedStandards();
    await seedWalkStandards();
    await logRun(1500);
    await logWalk(3846);

    await recomputeRunRank(db, OWNER_USER_ID, "5k", "run");
    await recomputeRunRank(db, OWNER_USER_ID, "all", "walk");

    const runPrRows = await db.query.runPrs.findMany({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.activityType, "run"), eq(runPrs.category, "5k")),
    });
    const walkPrRows = await db.query.runPrs.findMany({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.activityType, "walk"), eq(runPrs.category, "all")),
    });
    expect(runPrRows.length).toBeGreaterThan(0);
    expect(walkPrRows.length).toBeGreaterThan(0);
    expect(runPrRows.filter((r) => r.kind === "speed").every((r) => r.value > 3)).toBe(true); // run m/s
    expect(walkPrRows.filter((r) => r.kind === "speed").every((r) => r.value < 2)).toBe(true); // walk m/s
    // Single-speed activities have no "time" PR — there's no fixed distance to divide by.
    expect(walkPrRows.some((r) => r.kind === "time")).toBe(false);
  });
});

describe("boot-time cardio standards self-heal (syncCardioStandards + recomputeAllCardioRanks)", () => {
  /** Mirrors exactly what app.ts's buildApp() runs at boot: rewrite run_standards if it's out of
   *  sync, then recompute every user's cardio ranks. Seeds run_standards with only "run" rows —
   *  the exact shape of a pre-walk/hike-rankable install — to reproduce the original bug (a
   *  walk/hike recompute silently returning null forever) and confirm the self-heal fixes it. */
  async function seedRunOnlyStandards() {
    const runRows = buildCardioStandards().filter((r) => r.activityType === "run");
    await db.insert(runStandards).values(
      runRows.map((r) => ({
        activityType: r.activityType,
        category: r.category,
        sex: r.sex,
        tier: r.tier,
        division: r.division,
        threshold: r.threshold,
        trust: r.trust,
      })),
    );
  }

  async function logWalk(durationS: number, distanceM = 5000) {
    const startedAt = new Date();
    const run = await insertRun(db, OWNER_USER_ID, {
      source: "healthconnect",
      activityType: "walk",
      name: null,
      startedAt,
      clientId: `walk-${Math.random().toString(36).slice(2, 8)}`,
      distanceM,
      durationS,
      avgPaceSPerKm: (durationS / distanceM) * 1000,
    });
    await insertRunPoints(db, run.id, [
      { idx: 0, t: startedAt.getTime(), lat: 52.0, lon: 13.0 },
      { idx: 1, t: startedAt.getTime() + durationS * 1000, lat: 52.01, lon: 13.01 },
    ]);
    return run;
  }

  it("a run-only run_standards table ends up with walk/hike rows after the heal, and a walk recompute stops returning null", async () => {
    await seedRunOnlyStandards();
    await logWalk(4000); // clears walk's eligibility floor (>=1000m, >=600s)

    // Before the heal: exactly the original bug — no standards rows for walk, so the recompute
    // silently no-ops.
    expect(await recomputeRunRank(db, OWNER_USER_ID, "all", "walk")).toBeNull();

    const { changed } = await syncCardioStandards(db);
    expect(changed).toBe(true);
    const rowsAfterSync = await db.select().from(runStandards);
    expect(rowsAfterSync.some((r) => r.activityType === "walk")).toBe(true);
    expect(rowsAfterSync.some((r) => r.activityType === "hike")).toBe(true);

    await recomputeAllCardioRanks(db);

    const walkRank = await findRunRankByBucket(db, OWNER_USER_ID, "all", "walk");
    expect(walkRank).toBeDefined();
    expect(walkRank?.tier).toBeDefined();
  });

  it("recomputeAllCardioRanks counts a skip for every bucket with no logged activity or no standards", async () => {
    const db2 = createTestDb();
    const result = await recomputeAllCardioRanks(db2);
    expect(result.recomputed).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
  });
});
