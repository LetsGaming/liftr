import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { exercises, standards } from "@liftr/db";
import { ANCHOR_STANDARDS, FEMALE_ANCHOR_STANDARDS, REP_STANDARDS } from "@liftr/shared";
import type { CatalogEntry } from "~ingest/catalogSchema.js";
import { ingestStandards } from "~ingest/ingestStandards.js";
import { createTestDb } from "./helpers/testDb.js";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "back-squat",
    wgerId: null,
    freeExerciseDbId: null,
    wgerImageId: null,
    nameDe: "Kniebeuge",
    nameEn: "Back Squat",
    equipment: "barbell",
    requiresEquipment: null,
    movementPattern: "squat",
    primaryMuscles: [],
    secondaryMuscles: [],
    isBodyweight: false,
    bodyweightLeverage: null,
    anchor: null,
    ratio: null,
    trust: "derived",
    ...overrides,
  };
}

async function seedExercise(db: ReturnType<typeof createTestDb>, slug: string, isBodyweight = false) {
  const [row] = await db.insert(exercises).values({ slug, movementPattern: "squat", isBodyweight }).returning();
  return row!;
}

describe("ingestStandards", () => {
  it("writes an anchor lift's real thresholds for both sexes (male from ANCHOR_STANDARDS, female ratio-adjusted)", async () => {
    const db = createTestDb();
    await seedExercise(db, "back-squat");

    await ingestStandards(db, [entry({ slug: "back-squat" })]);

    const rows = await db.select().from(standards);
    const male = rows.filter((r) => r.sex === "male");
    const female = rows.filter((r) => r.sex === "female");
    expect(male).toHaveLength(ANCHOR_STANDARDS["back-squat"]!.length);
    expect(female).toHaveLength(FEMALE_ANCHOR_STANDARDS["back-squat"]!.length);
    expect(male.every((r) => r.metric === "load_ratio")).toBe(true);
    expect(male.every((r) => r.trust === "real")).toBe(true);
    // female thresholds are ratio-derived from the male anchor, so strictly lower at every division.
    const maleTotal = male.reduce((sum, r) => sum + r.threshold, 0);
    const femaleTotal = female.reduce((sum, r) => sum + r.threshold, 0);
    expect(femaleTotal).toBeLessThan(maleTotal);
  });

  it("writes bodyweight rep norms with metric 'reps', identical for both sexes (no sex-specific source yet)", async () => {
    const db = createTestDb();
    await seedExercise(db, "pushup", true);

    await ingestStandards(db, [entry({ slug: "pushup", isBodyweight: true, equipment: "bodyweight" })]);

    const rows = await db.select().from(standards);
    expect(rows).toHaveLength(REP_STANDARDS.pushup!.length * 2);
    expect(rows.every((r) => r.metric === "reps")).toBe(true);
    const male = rows.filter((r) => r.sex === "male").map((r) => r.threshold);
    const female = rows.filter((r) => r.sex === "female").map((r) => r.threshold);
    expect(female).toEqual(male);
  });

  it("derives a Tier B/C entry's thresholds from its anchor x ratio, downgrading trust to 'derived'", async () => {
    const db = createTestDb();
    const exercise = await seedExercise(db, "front-squat");

    await ingestStandards(db, [entry({ slug: "front-squat", anchor: "back-squat", ratio: 0.5, trust: "derived" })]);

    const rows = await db.select().from(standards).where(eq(standards.exerciseId, exercise.id));
    const male = rows.filter((r) => r.sex === "male");
    expect(male).toHaveLength(ANCHOR_STANDARDS["back-squat"]!.length);
    expect(male.every((r) => r.trust === "derived")).toBe(true);
    // threshold = anchor's threshold * ratio, division-for-division.
    const anchorSorted = [...ANCHOR_STANDARDS["back-squat"]!].sort((a, b) => a.threshold - b.threshold);
    const maleSorted = [...male].sort((a, b) => a.threshold - b.threshold);
    for (let i = 0; i < anchorSorted.length; i++) {
      expect(maleSorted[i]!.threshold).toBeCloseTo(anchorSorted[i]!.threshold * 0.5);
    }
  });

  it("downgrades trust to 'synthetic' when the catalog entry itself is marked synthetic", async () => {
    const db = createTestDb();
    await seedExercise(db, "goblet-squat");

    await ingestStandards(db, [entry({ slug: "goblet-squat", anchor: "back-squat", ratio: 0.3, trust: "synthetic" })]);

    const rows = await db.select().from(standards);
    expect(rows.every((r) => r.trust === "synthetic")).toBe(true);
  });

  it("warns and writes nothing for an entry with no anchor default and no anchor/ratio pair", async () => {
    const db = createTestDb();
    await seedExercise(db, "mystery-lift");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ingestStandards(db, [entry({ slug: "mystery-lift" })]);

    expect(await db.select().from(standards)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"mystery-lift" has no anchor/ratio'));
  });

  it("warns and writes nothing when the entry's exercise row doesn't exist yet (--catalog must run first)", async () => {
    const db = createTestDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await ingestStandards(db, [entry({ slug: "back-squat" })]);

    expect(await db.select().from(standards)).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"back-squat" not found in exercises table'));
  });

  it("is idempotent: re-running replaces this exercise's standards rather than duplicating them", async () => {
    const db = createTestDb();
    await seedExercise(db, "back-squat");

    await ingestStandards(db, [entry({ slug: "back-squat" })]);
    await ingestStandards(db, [entry({ slug: "back-squat" })]);

    const rows = await db.select().from(standards);
    expect(rows).toHaveLength(ANCHOR_STANDARDS["back-squat"]!.length + FEMALE_ANCHOR_STANDARDS["back-squat"]!.length);
  });
});
