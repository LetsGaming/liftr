/**
 * `pnpm ingest --catalog` (plan 0.4). Reads tools/catalog/curated.yaml, upserts muscles +
 * exercises + exercise_muscles. Idempotent: re-running with an unchanged file is a no-op;
 * re-running after editing curated.yaml updates existing rows rather than duplicating them.
 *
 * Equipment (feedback: "map equipment to exercises without manually adjusting the code every
 * time") is resolved via resolveEquipment.ts before insert: curated.yaml's own `equipment:`
 * wins when set, otherwise it's auto-filled from free-exercise-db/wger by freeExerciseDbId /
 * wgerId — see equipment/ for the adapters and the normalization mapping into this app's
 * closed 10-value vocabulary (@liftr/shared's Equipment type).
 */
import { exerciseMuscles, exercises, muscles, type LiftrDb } from "@liftr/db";
import { eq, notInArray } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { deriveRequirements, mapWgerEquipmentToRequirements, type TieredRequirement } from "@liftr/shared";
import { catalogFileSchema, type CatalogEntry } from "./catalogSchema.js";
import { freeExerciseDbEquipmentSource } from "./equipment/freeExerciseDbSource.js";
import { logEquipmentResolutionSummary, resolveEquipmentForCatalog } from "./equipment/resolveEquipment.js";
import type { EquipmentSourceAdapter } from "./equipment/types.js";
import { fetchWgerFullEquipmentIndex, wgerEquipmentSource } from "./equipment/wgerSource.js";
import { MUSCLES } from "./muscles.js";

const DEFAULT_EQUIPMENT_SOURCES: EquipmentSourceAdapter[] = [freeExerciseDbEquipmentSource, wgerEquipmentSource];

export async function loadCatalog(path: string): Promise<CatalogEntry[]> {
  const raw = await readFile(path, "utf-8");
  const parsed = catalogFileSchema.parse(parseYaml(raw));
  return parsed.exercises;
}

export async function ingestMuscles(db: LiftrDb) {
  for (const m of MUSCLES) {
    await db
      .insert(muscles)
      .values({ slug: m.slug, svgRegionKey: m.svgRegionKey })
      .onConflictDoUpdate({ target: muscles.slug, set: { svgRegionKey: m.svgRegionKey } });
  }
  // prune muscles no longer in the seed list (e.g. the old hand-drawn-region taxonomy this
  // replaced) — safe because exercise_muscles cascades on delete and curated.yaml is always
  // re-ingested first, so nothing still references a dropped slug at this point.
  const currentSlugs = MUSCLES.map((m) => m.slug);
  const pruned = await db.delete(muscles).where(notInArray(muscles.slug, currentSlugs)).returning();
  if (pruned.length > 0) {
    console.log(`muscles: pruned ${pruned.length} no-longer-seeded (${pruned.map((p) => p.slug).join(", ")})`);
  }
  console.log(`muscles: upserted ${MUSCLES.length}`);
}

/**
 * Feature: "research what public sources we could use to get the best equipment-per-exercise
 * results and don't need to hand-audit it for every exercise." wger tags each exercise with its
 * full equipment list (not just one priority-collapsed value) — this is the join, by wgerId
 * (populated once via matchWgerIds.ts). Degrades to an empty map on failure (offline, wger down,
 * rate-limited), same "don't abort the whole ingest over one flaky upstream" rule
 * resolveEquipmentForCatalog already follows — every entry just falls back to deriveRequirements.
 */
async function fetchWgerFullEquipmentIndexSafely(): Promise<Map<string, string[]>> {
  try {
    return await fetchWgerFullEquipmentIndex();
  } catch (err) {
    console.warn(`  ! wger full-equipment source unavailable, skipping: ${err instanceof Error ? err.message : err}`);
    return new Map();
  }
}

/**
 * Picks the best available source for one entry's tiered requirement list, in order:
 *   1. curated.yaml's `requiresEquipment` override — always wins, always "required" tier (every
 *      hand-authored override so far exists to fix a hard "can't do this without it" gap).
 *   2. wger's real per-exercise equipment tags, if `wgerId` is joined *and* wger's own tags
 *      actually include this entry's hand-set primary `equipment` — that agreement check is a
 *      cheap sanity guard against a wrong wgerId match (matchWgerIds.ts's fuzzy name matching
 *      isn't perfect) quietly poisoning requiredEquipment with an unrelated exercise's gear.
 *   3. deriveRequirements()'s slug/pattern rules — the original fallback, unchanged.
 */
function buildRequiredEquipment(
  entry: CatalogEntry,
  resolvedEquipment: string | null,
  wgerFullIndex: Map<string, string[]>,
): { requirements: TieredRequirement[]; source: "override" | "wger" | "rules" } {
  if (entry.requiresEquipment) {
    const requirements: TieredRequirement[] = entry.requiresEquipment.map((item) => ({ item: item as TieredRequirement["item"], tier: "required" }));
    return { requirements, source: "override" };
  }

  if (entry.wgerId != null) {
    const wgerNames = wgerFullIndex.get(String(entry.wgerId));
    if (wgerNames) {
      const wgerRequirements = mapWgerEquipmentToRequirements(wgerNames);
      const agreesWithHandSetEquipment =
        resolvedEquipment == null || wgerRequirements.some((r) => r.tier === "required" && r.item === resolvedEquipment);
      if (agreesWithHandSetEquipment && wgerRequirements.length > 0) return { requirements: wgerRequirements, source: "wger" };
    }
  }

  return {
    requirements: deriveRequirements({ slug: entry.slug, equipment: resolvedEquipment, movementPattern: entry.movementPattern }),
    source: "rules",
  };
}

export async function ingestCatalog(db: LiftrDb, catalogPath: string, equipmentSources: EquipmentSourceAdapter[] = DEFAULT_EQUIPMENT_SOURCES) {
  const entries = await loadCatalog(catalogPath);
  await ingestMuscles(db);

  const muscleBySlug = new Map((await db.select().from(muscles)).map((m) => [m.slug, m.id]));

  const { equipmentBySlug, summary } = await resolveEquipmentForCatalog(entries, equipmentSources);
  logEquipmentResolutionSummary(summary);

  const wgerFullIndex = await fetchWgerFullEquipmentIndexSafely();
  let wgerSourced = 0;

  let created = 0;
  let updated = 0;

  for (const entry of entries) {
    const existing = await db.query.exercises.findFirst({ where: eq(exercises.slug, entry.slug) });

    const resolvedEquipment = equipmentBySlug.get(entry.slug) ?? null;
    const { requirements: requiredEquipment, source: requirementSource } = buildRequiredEquipment(entry, resolvedEquipment, wgerFullIndex);
    if (requirementSource === "wger") wgerSourced++;

    const values = {
      slug: entry.slug,
      // No `name` set for catalog exercises — the client resolves their display name via i18n,
      // keyed on `slug` (packages/client/src/composables/useExerciseName.ts). `name` is populated
      // only for custom (user-created) exercises, which have no i18n entry of their own.
      equipment: resolvedEquipment,
      requiredEquipment: JSON.stringify(requiredEquipment),
      movementPattern: entry.movementPattern,
      isBodyweight: entry.isBodyweight,
      isCustom: false,
      howToKey: `exercise.${entry.slug}.howto`,
      bodyweightLeverage: entry.bodyweightLeverage,
    };

    let exerciseId: string;
    if (existing) {
      await db.update(exercises).set(values).where(eq(exercises.id, existing.id));
      exerciseId = existing.id;
      updated++;
    } else {
      const [row] = await db.insert(exercises).values(values).returning();
      exerciseId = row!.id;
      created++;
    }

    // replace muscle tags wholesale for this exercise — simpler and safe to re-run
    await db.delete(exerciseMuscles).where(eq(exerciseMuscles.exerciseId, exerciseId));
    const tagRows = [
      ...entry.primaryMuscles.map((slug) => ({ slug, role: "primary" as const })),
      ...entry.secondaryMuscles.map((slug) => ({ slug, role: "secondary" as const })),
    ]
      .map(({ slug, role }) => {
        const muscleId = muscleBySlug.get(slug);
        if (!muscleId) {
          console.warn(`  ! unknown muscle "${slug}" on exercise "${entry.slug}" — skipped`);
          return null;
        }
        return { exerciseId, muscleId, role };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);

    if (tagRows.length > 0) {
      await db.insert(exerciseMuscles).values(tagRows);
    }
  }

  console.log(`exercises: ${created} created, ${updated} updated (${entries.length} total in catalog)`);
  console.log(`requiredEquipment: ${wgerSourced} sourced from wger's real tags, ${entries.length - wgerSourced} from rules/override`);
}
