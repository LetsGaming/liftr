import { describe, expect, it } from "vitest";
import { runStandards } from "@liftr/db";
import { buildCardioStandards, RUN_CATEGORIES } from "@liftr/shared";
import { ingestRunStandards } from "~ingest/ingestRunStandards.js";
import { createTestDb } from "./helpers/testDb.js";

describe("ingestRunStandards", () => {
  it("writes all 378 threshold rows (run: 5 categories x 2 sexes x 27 divisions; walk/hike: 1 bucket x 2 sexes x 27 divisions each)", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    const expected = buildCardioStandards();
    expect(rows).toHaveLength(expected.length);
    expect(rows).toHaveLength(378);
  });

  it("writes rows for every run category and both sexes", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    for (const category of RUN_CATEGORIES) {
      const male = rows.filter((r) => r.activityType === "run" && r.category === category && r.sex === "male");
      const female = rows.filter((r) => r.activityType === "run" && r.category === category && r.sex === "female");
      expect(male.length).toBeGreaterThan(0);
      expect(female.length).toBeGreaterThan(0);
    }
    expect(rows.filter((r) => r.activityType === "run").every((r) => r.trust === "derived")).toBe(true);
  });

  it("writes one bucket ('all') for walk and hike, both sexes, trust 'synthetic'", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    for (const activityType of ["walk", "hike"] as const) {
      const activityRows = rows.filter((r) => r.activityType === activityType);
      expect(activityRows.every((r) => r.category === "all")).toBe(true);
      expect(activityRows.filter((r) => r.sex === "male").length).toBeGreaterThan(0);
      expect(activityRows.filter((r) => r.sex === "female").length).toBeGreaterThan(0);
      expect(activityRows.every((r) => r.trust === "synthetic")).toBe(true);
    }
  });

  it("is idempotent: re-running replaces the table rather than duplicating rows", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);
    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    expect(rows).toHaveLength(378);
  });
});
