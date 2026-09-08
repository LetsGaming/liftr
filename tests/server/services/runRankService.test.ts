import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, runPrs, runStandards, type LiftrDb } from "@liftr/db";
import { writeJsonSetting } from "~server/repositories/settingsRepository.js";
import { insertRun, insertRunPoints, type NewRun } from "~server/repositories/runRepository.js";
import { findRunRankByCategory, findAllRunRanks } from "~server/repositories/runRankRepository.js";
import { recomputeRunRank } from "~server/services/runRankService.js";
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
    expect(await recomputeRunRank(db, OWNER_USER_ID, "5k")).toBeNull();
  });

  it("returns null when there is no rank-eligible run history for the category", async () => {
    await seedStandards();
    expect(await recomputeRunRank(db, OWNER_USER_ID, "5k")).toBeNull();
  });

  it("resolves a tier from the best logged run's Riegel-adjusted speed (first-ever, no storedPeak)", async () => {
    await seedStandards();
    // 5000/1500 = 3.333 m/s -> apprentice/III (>=3.0, <3.5), lp = (3.333-3.0)/(3.5-3.0)*100 ~ 66.7
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(result).not.toBeNull();
    expect(result!.tier).toBe("apprentice");
    expect(result!.division).toBe(3);
    expect(result!.lp).toBeCloseTo(66.67, 1);
    // First-ever result is uncorroborated (no second distinct day yet) -> no peak, no rank-up.
    expect(result!.rankedUp).toBe(false);
    const row = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
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

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(result!.rankedUp).toBe(false);
    const row = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
    expect(row?.peakTier).toBeNull();
  });

  it("a next-day corroborating run locks the peak in and logs a rank-up", async () => {
    await seedStandards();
    await establishCorroboratedPeak(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(result!.rankedUp).toBe(true);
    const row = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
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
    const first = await recomputeRunRank(db, OWNER_USER_ID, "5k");
    expect(first!.rankedUp).toBe(true);

    // Second recompute, no new runs logged — same stale history, so decay now applies.
    const second = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(second!.rankedUp).toBe(false); // peak itself doesn't change on a decay-only recompute
    expect(second!.tier).toBe("apprentice");
    expect(second!.division).toBe(4); // floor of apprentice (TIER_DIVISION_COUNT.apprentice = 4)
    expect(second!.lp).toBe(0);

    const row = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
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
      name: null,
      startedAt: new Date(),
      clientId: `manual-run-${Math.random().toString(36).slice(2, 8)}`,
      distanceM: 5000,
      durationS: 1000, // 5000/1000 = 5.0 m/s -> would be "athlete" tier
      avgPaceSPerKm: 200,
    });

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(result!.tier).toBe("apprentice");
    const row = await findRunRankByCategory(db, OWNER_USER_ID, "5k");
    expect(row?.bestSpeedMps).toBeCloseTo(3.333, 2);
  });

  it("detects a new speed/time PR on the first-ever computation (PR is independent of peak corroboration)", async () => {
    await seedStandards();
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(result!.rankedUp).toBe(false); // uncorroborated, but PR detection doesn't care
    expect(result!.newPr).not.toBeNull();
    expect(result!.newPr!.value).toBeCloseTo(3.333, 2);
  });

  it("does not insert a spurious 'time' PR once >=2 time-PR rows exist and the true best hasn't changed (findBestRunPrByKind kind-direction bug regression)", async () => {
    await seedStandards();

    // Recompute #1: first-ever run, D1=1500s (3.333 m/s) -> inserts time PR value=1500.
    await logRun(1500);
    const first = await recomputeRunRank(db, OWNER_USER_ID, "5k");
    expect(first!.newPr).not.toBeNull();

    // Recompute #2: a genuinely faster run, D2=1400s (3.571 m/s) becomes the new overall best
    // (both speed and time improve together since they're tied to the same run) -> inserts a
    // second time PR row, value=1400. Two "time" rows now exist: {1500, 1400}.
    await logRun(1400);
    const second = await recomputeRunRank(db, OWNER_USER_ID, "5k");
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
    const third = await recomputeRunRank(db, OWNER_USER_ID, "5k");

    expect(third!.newPr).toBeNull();
    const timePrRowsAfterThird = await db.query.runPrs.findMany({
      where: and(eq(runPrs.userId, OWNER_USER_ID), eq(runPrs.category, "5k"), eq(runPrs.kind, "time")),
    });
    expect(timePrRowsAfterThird).toHaveLength(2); // still exactly 2 — no spurious insert
  });

  it("does not record a PR when plausibilityMultiplier is below PR_ELIGIBILITY_FLOOR (0.5)", async () => {
    await seedStandards();
    await logRun(1500);

    const result = await recomputeRunRank(db, OWNER_USER_ID, "5k", 0.4, null);

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

    const maleResult = await recomputeRunRank(db, OWNER_USER_ID, "5k");
    expect(maleResult!.tier).toBe("apprentice"); // below the male athlete threshold of 50

    await writeJsonSetting(db, OWNER_USER_ID, "profile", { sex: "female" });
    const femaleResult = await recomputeRunRank(db, OWNER_USER_ID, "5k");
    expect(femaleResult!.tier).toBe("athlete"); // 3.333 clears the female athlete threshold of 3.0
  });

  it("keeps separate rows per category (findAllRunRanks sanity)", async () => {
    await seedStandards();
    await db.insert(runStandards).values([
      { category: "10k", sex: "male", tier: "apprentice", division: 3, threshold: 3.0, trust: "real" },
    ]);
    await logRun(1500);
    await insertRun(db, OWNER_USER_ID, {
      source: "gpx",
      name: null,
      startedAt: new Date(),
      clientId: "10k-run",
      distanceM: 10000,
      durationS: 3000,
      avgPaceSPerKm: 300,
    }).then(async (run) => {
      await insertRunPoints(db, run.id, [{ idx: 0, t: Date.now(), lat: 52.0, lon: 13.0 }]);
    });

    await recomputeRunRank(db, OWNER_USER_ID, "5k");
    await recomputeRunRank(db, OWNER_USER_ID, "10k");

    const all = await findAllRunRanks(db, OWNER_USER_ID);
    expect(all.map((r) => r.category).sort()).toEqual(["10k", "5k"]);
  });
});
