import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, streaks, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { creditStreak, findAllStreakDates } from "~server/repositories/streakRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findAllStreakDates", () => {
  it("returns an empty set when there are no streak rows", async () => {
    const result = await findAllStreakDates(db, OWNER_USER_ID);
    expect(result).toEqual(new Set());
  });

  it("returns the distinct set of dates across both workout and run kinds", async () => {
    await db.insert(streaks).values([
      { date: "2026-09-01", kind: "workout" },
      { date: "2026-09-02", kind: "run" },
    ]);

    const result = await findAllStreakDates(db, OWNER_USER_ID);

    expect(result).toEqual(new Set(["2026-09-01", "2026-09-02"]));
  });
});

describe("creditStreak", () => {
  it("inserts a new streak row for the given date and kind", async () => {
    await creditStreak(db, OWNER_USER_ID, "2026-09-05", "workout");

    const dates = await findAllStreakDates(db, OWNER_USER_ID);
    expect(dates.has("2026-09-05")).toBe(true);
  });

  it("is idempotent: crediting the same date+kind twice does not throw or duplicate", async () => {
    await creditStreak(db, OWNER_USER_ID, "2026-09-05", "workout");
    await creditStreak(db, OWNER_USER_ID, "2026-09-05", "workout");

    const rows = await db.query.streaks.findMany({ where: (s, { eq }) => eq(s.date, "2026-09-05") });
    expect(rows).toHaveLength(1);
  });

  it("allows both a workout and a run credit on the same date as separate rows", async () => {
    await creditStreak(db, OWNER_USER_ID, "2026-09-05", "workout");
    await creditStreak(db, OWNER_USER_ID, "2026-09-05", "run");

    const rows = await db.query.streaks.findMany({ where: (s, { eq }) => eq(s.date, "2026-09-05") });
    expect(rows.map((r) => r.kind).sort()).toEqual(["run", "workout"]);
  });
});
