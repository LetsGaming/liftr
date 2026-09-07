import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exerciseMuscles, exercises, muscles } from "@liftr/db";
import type { Equipment } from "@liftr/shared";
import type { EquipmentSourceAdapter } from "~ingest/equipment/types.js";
import { ingestCatalog, ingestMuscles, loadCatalog } from "~ingest/ingestCatalog.js";
import { createTestDb } from "./helpers/testDb.js";

// fetchWgerFullEquipmentIndex hits a real network endpoint and is called unconditionally inside
// ingestCatalog() (fetchWgerFullEquipmentIndexSafely) regardless of which equipmentSources are
// passed in — this is the one true I/O boundary that must be mocked (per tests/README.md) rather
// than routed around. Named with the vitest-required "mock" prefix so it's usable inside the
// hoisted vi.mock factory below; vi.mock itself is hoisted above every import in this file
// regardless of where it's written, so the mocked module is what ingestCatalog.js actually
// resolves "./equipment/wgerSource.js" to at import time.
const mockFetchWgerFullEquipmentIndex = vi.fn(async () => new Map<string, string[]>());
vi.mock("~ingest/equipment/wgerSource.js", () => ({
  wgerEquipmentSource: { name: "wger", buildIndex: vi.fn(async () => new Map()) },
  fetchWgerFullEquipmentIndex: () => mockFetchWgerFullEquipmentIndex(),
}));

function source(name: string, index: Record<string, Equipment | null>): EquipmentSourceAdapter {
  return {
    name,
    async buildIndex() {
      return new Map(Object.entries(index));
    },
  };
}

let tmpDir: string | undefined;

function writeCatalog(yaml: string): string {
  tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-catalog-"));
  const catalogPath = join(tmpDir, "curated.yaml");
  writeFileSync(catalogPath, yaml, "utf-8");
  return catalogPath;
}

beforeEach(() => {
  mockFetchWgerFullEquipmentIndex.mockReset();
  mockFetchWgerFullEquipmentIndex.mockResolvedValue(new Map());
});

afterEach(() => {
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe("loadCatalog", () => {
  it("parses a yaml file into schema-validated catalog entries", async () => {
    const path = writeCatalog(`
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
    primaryMuscles: [quads]
`);

    const entries = await loadCatalog(path);

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ slug: "back-squat", equipment: "barbell", primaryMuscles: ["quads"] });
  });
});

describe("ingestMuscles", () => {
  it("upserts every seeded muscle and prunes rows no longer in the seed list", async () => {
    const db = createTestDb();
    await db.insert(muscles).values({ slug: "stale-muscle", svgRegionKey: "99" });

    await ingestMuscles(db);

    const rows = await db.select().from(muscles);
    expect(rows.map((r) => r.slug).sort()).not.toContain("stale-muscle");
    expect(rows).toHaveLength(15); // MUSCLES.length
    expect(rows.find((r) => r.slug === "quads")?.svgRegionKey).toBe("10");
  });
});

describe("ingestCatalog", () => {
  it("creates a new exercise row with curated.yaml's hand-set equipment and derived-rule requirements", async () => {
    const db = createTestDb();
    const path = writeCatalog(`
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
    primaryMuscles: [quads]
    secondaryMuscles: [glutes]
`);

    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "back-squat") });
    expect(row).toBeDefined();
    expect(row!.equipment).toBe("barbell");
    expect(row!.movementPattern).toBe("squat");
    expect(row!.howToKey).toBe("exercise.back-squat.howto");
    const requiredEquipment = JSON.parse(row!.requiredEquipment!);
    // deriveRequirements: barbell squat -> barbell, plates, rack (all required).
    expect(requiredEquipment).toEqual(expect.arrayContaining([{ item: "barbell", tier: "required" }, { item: "rack", tier: "required" }]));

    const tags = await db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, row!.id));
    expect(tags).toHaveLength(2);
    const bySlug = new Map(
      await Promise.all(
        tags.map(async (t) => {
          const m = await db.query.muscles.findFirst({ where: eq(muscles.id, t.muscleId) });
          return [m!.slug, t.role] as const;
        }),
      ),
    );
    expect(bySlug.get("quads")).toBe("primary");
    expect(bySlug.get("glutes")).toBe("secondary");
  });

  it("auto-resolves equipment from a source when curated.yaml leaves it null", async () => {
    const db = createTestDb();
    const path = writeCatalog(`
exercises:
  - slug: dumbbell-curl
    nameDe: Bizeps-Curl
    nameEn: Dumbbell Curl
    movementPattern: isolation-arms
    freeExerciseDbId: Dumbbell_Curl
`);

    await ingestCatalog(db, path, [source("free-exercise-db", { Dumbbell_Curl: "dumbbell" })]);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "dumbbell-curl") });
    expect(row!.equipment).toBe("dumbbell");
  });

  it("updates an existing row in place on re-ingest rather than creating a duplicate", async () => {
    const db = createTestDb();
    const path = writeCatalog(`
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
`);

    await ingestCatalog(db, path, []);
    const first = await db.query.exercises.findFirst({ where: eq(exercises.slug, "back-squat") });

    writeFileSync(
      path,
      `
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: hinge
    equipment: barbell
`,
      "utf-8",
    );
    await ingestCatalog(db, path, []);

    const all = await db.select().from(exercises);
    expect(all).toHaveLength(1);
    expect(all[0]!.id).toBe(first!.id);
    expect(all[0]!.movementPattern).toBe("hinge");
  });

  it("wholesale-replaces muscle tags on re-ingest rather than accumulating duplicates", async () => {
    const db = createTestDb();
    const path = writeCatalog(`
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
    primaryMuscles: [quads]
`);
    await ingestCatalog(db, path, []);

    writeFileSync(
      path,
      `
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
    primaryMuscles: [glutes]
`,
      "utf-8",
    );
    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "back-squat") });
    const tags = await db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, row!.id));
    expect(tags).toHaveLength(1);
  });

  it("warns and skips a muscle tag referencing an unknown slug rather than failing the whole ingest", async () => {
    const db = createTestDb();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const path = writeCatalog(`
exercises:
  - slug: back-squat
    nameDe: Kniebeuge
    nameEn: Back Squat
    movementPattern: squat
    equipment: barbell
    primaryMuscles: [not-a-real-muscle]
`);

    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "back-squat") });
    const tags = await db.select().from(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, row!.id));
    expect(tags).toHaveLength(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('unknown muscle "not-a-real-muscle"'));
  });

  it("prefers a curated.yaml requiresEquipment override over both wger's tags and deriveRequirements", async () => {
    const db = createTestDb();
    mockFetchWgerFullEquipmentIndex.mockResolvedValue(new Map([["42", ["Dumbbell"]]]));
    const path = writeCatalog(`
exercises:
  - slug: bench-press
    nameDe: Bankdrücken
    nameEn: Bench Press
    movementPattern: push-horizontal
    equipment: barbell
    wgerId: 42
    requiresEquipment: [barbell, plates, bench]
`);

    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "bench-press") });
    const requiredEquipment = JSON.parse(row!.requiredEquipment!);
    expect(requiredEquipment).toEqual([
      { item: "barbell", tier: "required" },
      { item: "plates", tier: "required" },
      { item: "bench", tier: "required" },
    ]);
  });

  it("sources requiredEquipment from wger's real per-exercise tags when the wgerId is joined and agrees with the resolved equipment", async () => {
    const db = createTestDb();
    mockFetchWgerFullEquipmentIndex.mockResolvedValue(new Map([["42", ["Barbell", "Bench"]]]));
    const path = writeCatalog(`
exercises:
  - slug: bench-press
    nameDe: Bankdrücken
    nameEn: Bench Press
    movementPattern: push-horizontal
    equipment: barbell
    wgerId: 42
`);

    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "bench-press") });
    const requiredEquipment = JSON.parse(row!.requiredEquipment!);
    expect(requiredEquipment).toEqual(
      expect.arrayContaining([
        { item: "barbell", tier: "required" },
        { item: "bench", tier: "required" },
        { item: "plates", tier: "required" },
      ]),
    );
  });

  it("falls back to deriveRequirements when the joined wger tags disagree with the resolved equipment", async () => {
    const db = createTestDb();
    // wgerId 42's real tags say "dumbbell", but curated.yaml's hand-set equipment says barbell —
    // the sanity-guard should reject this join and fall back to the rule-based deriver instead.
    mockFetchWgerFullEquipmentIndex.mockResolvedValue(new Map([["42", ["Dumbbell"]]]));
    const path = writeCatalog(`
exercises:
  - slug: bench-press
    nameDe: Bankdrücken
    nameEn: Bench Press
    movementPattern: push-horizontal
    equipment: barbell
    wgerId: 42
`);

    await ingestCatalog(db, path, []);

    const row = await db.query.exercises.findFirst({ where: eq(exercises.slug, "bench-press") });
    const requiredEquipment = JSON.parse(row!.requiredEquipment!);
    // deriveRequirements for a bench-press-slug barbell push-horizontal lift: barbell, plates, bench.
    expect(requiredEquipment).toEqual(
      expect.arrayContaining([
        { item: "barbell", tier: "required" },
        { item: "bench", tier: "required" },
      ]),
    );
    expect(requiredEquipment).not.toEqual(expect.arrayContaining([{ item: "dumbbell", tier: "required" }]));
  });
});
