import { describe, expect, it } from "vitest";
import { runStandards } from "@liftr/db";
import { buildRunStandards, RUN_CATEGORIES } from "@liftr/shared";
import { ingestRunStandards } from "~ingest/ingestRunStandards.js";
import { createTestDb } from "./helpers/testDb.js";

describe("ingestRunStandards", () => {
  it("writes all 270 threshold rows (5 categories x 2 sexes x 27 divisions)", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    const expected = buildRunStandards();
    expect(rows).toHaveLength(expected.length);
    expect(rows).toHaveLength(270);
  });

  it("writes rows for every run category and both sexes", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    for (const category of RUN_CATEGORIES) {
      const male = rows.filter((r) => r.category === category && r.sex === "male");
      const female = rows.filter((r) => r.category === category && r.sex === "female");
      expect(male.length).toBeGreaterThan(0);
      expect(female.length).toBeGreaterThan(0);
    }
    expect(rows.every((r) => r.trust === "derived")).toBe(true);
  });

  it("is idempotent: re-running replaces the table rather than duplicating rows", async () => {
    const db = createTestDb();

    await ingestRunStandards(db);
    await ingestRunStandards(db);

    const rows = await db.select().from(runStandards);
    expect(rows).toHaveLength(270);
  });
});
