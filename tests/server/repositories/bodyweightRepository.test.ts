import { beforeEach, describe, expect, it } from "vitest";
import { bodyweightLogs, type LiftrDb } from "@liftr/db";
import { findLatestBodyweightLog, findRecentBodyweightLogs, upsertBodyweightLog } from "~server/repositories/bodyweightRepository.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

async function insertLog(date: string, weightKg: number) {
  const [row] = await db.insert(bodyweightLogs).values({ date, weightKg }).returning();
  return row!;
}

describe("findRecentBodyweightLogs", () => {
  it("returns an empty array when there are no logs", async () => {
    const result = await findRecentBodyweightLogs(db);
    expect(result).toEqual([]);
  });

  it("orders logs most-recent-date first", async () => {
    await insertLog("2026-09-01", 80);
    await insertLog("2026-09-05", 81);
    await insertLog("2026-09-03", 80.5);

    const result = await findRecentBodyweightLogs(db);

    expect(result.map((r) => r.date)).toEqual(["2026-09-05", "2026-09-03", "2026-09-01"]);
  });

  it("caps the returned rows at the given limit", async () => {
    await insertLog("2026-09-01", 80);
    await insertLog("2026-09-02", 80);
    await insertLog("2026-09-03", 80);

    const result = await findRecentBodyweightLogs(db, 2);

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.date)).toEqual(["2026-09-03", "2026-09-02"]);
  });

  it("defaults the limit to 60", async () => {
    for (let i = 0; i < 61; i++) {
      const date = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
      await insertLog(date, 80);
    }

    const result = await findRecentBodyweightLogs(db);

    expect(result).toHaveLength(60);
  });
});

describe("findLatestBodyweightLog", () => {
  it("returns undefined when there are no logs", async () => {
    const result = await findLatestBodyweightLog(db);
    expect(result).toBeUndefined();
  });

  it("returns the log with the most recent date", async () => {
    await insertLog("2026-08-01", 79);
    await insertLog("2026-09-01", 82);

    const result = await findLatestBodyweightLog(db);

    expect(result?.date).toBe("2026-09-01");
    expect(result?.weightKg).toBe(82);
  });
});

describe("upsertBodyweightLog", () => {
  it("inserts a new row when no log exists for that date", async () => {
    const row = await upsertBodyweightLog(db, "2026-09-07", 78.5);

    expect(row.date).toBe("2026-09-07");
    expect(row.weightKg).toBe(78.5);

    const all = await db.query.bodyweightLogs.findMany();
    expect(all).toHaveLength(1);
  });

  it("overwrites the existing row's weight for that date rather than inserting a duplicate", async () => {
    const first = await upsertBodyweightLog(db, "2026-09-07", 78.5);

    const second = await upsertBodyweightLog(db, "2026-09-07", 79.2);

    expect(second.id).toBe(first.id);
    expect(second.weightKg).toBe(79.2);

    const all = await db.query.bodyweightLogs.findMany();
    expect(all).toHaveLength(1);
    expect(all[0]?.weightKg).toBe(79.2);
  });

  it("does not affect a log on a different date", async () => {
    await upsertBodyweightLog(db, "2026-09-06", 78);
    await upsertBodyweightLog(db, "2026-09-07", 79);

    const all = await db.query.bodyweightLogs.findMany();
    expect(all).toHaveLength(2);
  });
});
