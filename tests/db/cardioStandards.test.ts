import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { createDb, runMigrations, runStandards, syncCardioStandards, type LiftrDb } from "@liftr/db";
import { buildCardioStandards } from "@liftr/shared";

let db: LiftrDb;

beforeEach(() => {
  db = createDb(":memory:");
  runMigrations(db);
});

describe("syncCardioStandards", () => {
  it("changed:true against an empty table, and writes walk+hike rows alongside run", async () => {
    const result = await syncCardioStandards(db);

    expect(result.changed).toBe(true);
    const rows = await db.select().from(runStandards);
    expect(rows).toHaveLength(buildCardioStandards().length);
    expect(rows.some((r) => r.activityType === "walk")).toBe(true);
    expect(rows.some((r) => r.activityType === "hike")).toBe(true);
    expect(rows.some((r) => r.activityType === "run")).toBe(true);
  });

  it("changed:false on a second identical call — no-op, doesn't touch the table", async () => {
    await syncCardioStandards(db);

    const result = await syncCardioStandards(db);

    expect(result.changed).toBe(false);
    const rows = await db.select().from(runStandards);
    expect(rows).toHaveLength(buildCardioStandards().length);
  });

  it("changed:true against a run-only table — exactly the pre-walk/hike upgrade scenario", async () => {
    const built = buildCardioStandards();
    await db.insert(runStandards).values(
      built
        .filter((r) => r.activityType === "run")
        .map((r) => ({
          activityType: r.activityType,
          category: r.category,
          sex: r.sex,
          tier: r.tier,
          division: r.division,
          threshold: r.threshold,
          trust: r.trust,
        })),
    );

    const result = await syncCardioStandards(db);

    expect(result.changed).toBe(true);
    const rows = await db.select().from(runStandards);
    expect(rows.some((r) => r.activityType === "walk")).toBe(true);
    expect(rows.some((r) => r.activityType === "hike")).toBe(true);
  });

  it("changed:true when a stored threshold has drifted from the built value, even with the same row count", async () => {
    await syncCardioStandards(db);
    const before = await db.select().from(runStandards);
    const target = before[0]!;
    await db.update(runStandards).set({ threshold: target.threshold + 1 }).where(eq(runStandards.id, target.id));

    const result = await syncCardioStandards(db);

    expect(result.changed).toBe(true);
  });
});
