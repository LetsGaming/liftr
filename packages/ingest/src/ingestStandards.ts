/**
 * `pnpm ingest --standards` (plan 0.4). Fully offline: seeds Tier-A anchor thresholds from
 * @liftr/shared's ANCHOR_STANDARDS/REP_STANDARDS defaults, then derives every Tier B/C
 * exercise's thresholds from its declared anchor x ratio (audit §7 "synthetic-standard
 * method"). No network call — OpenPowerlifting/ExRx calibration already lives in the shared
 * constants; re-run any time curated.yaml's ratios change to re-derive the long tail.
 *
 * Writes one row set per sex (QUAL-04): male rows from ANCHOR_STANDARDS (the OPL-competition-
 * scale data this app was already calibrated against), female rows from
 * FEMALE_ANCHOR_STANDARDS (the same anchors run through a sourced male:female ratio — see that
 * constant's own doc for exactly what's sourced vs. inferred-by-analogy). Bodyweight rep norms
 * (REP_STANDARDS) have no sex-specific source yet, so both sexes get the same rep thresholds —
 * an honest scope limit, not a claim either direction.
 */
import { exercises, standards, type LiftrDb } from "@liftr/db";
import {
  ANCHOR_STANDARDS,
  FEMALE_ANCHOR_STANDARDS,
  REP_STANDARDS,
  deriveStandards,
  type StandardThreshold,
} from "@liftr/shared";
import { eq } from "drizzle-orm";
import type { CatalogEntry } from "./catalogSchema.js";

const SEXES = ["male", "female"] as const;
type Sex = (typeof SEXES)[number];

function resolveThresholds(entry: CatalogEntry, sex: Sex): StandardThreshold[] | null {
  const anchors = sex === "male" ? ANCHOR_STANDARDS : FEMALE_ANCHOR_STANDARDS;

  if (entry.isBodyweight && REP_STANDARDS[entry.slug]) {
    return REP_STANDARDS[entry.slug]!;
  }
  if (anchors[entry.slug]) {
    return anchors[entry.slug]!;
  }
  if (entry.anchor && entry.ratio != null) {
    const anchorThresholds = anchors[entry.anchor] ?? REP_STANDARDS[entry.anchor];
    if (!anchorThresholds) return null;
    return deriveStandards(anchorThresholds, entry.ratio, entry.trust === "synthetic" ? "synthetic" : "derived");
  }
  return null;
}

export async function ingestStandards(db: LiftrDb, entries: CatalogEntry[]) {
  let written = 0;

  for (const entry of entries) {
    const bySex = new Map<Sex, StandardThreshold[]>();
    for (const sex of SEXES) {
      const thresholds = resolveThresholds(entry, sex);
      if (thresholds) bySex.set(sex, thresholds);
    }
    if (bySex.size === 0) {
      console.warn(`  ! "${entry.slug}" has no anchor/ratio and no default standard — skipped`);
      continue;
    }

    const exercise = await db.query.exercises.findFirst({ where: eq(exercises.slug, entry.slug) });
    if (!exercise) {
      console.warn(`  ! "${entry.slug}" not found in exercises table — run --catalog first`);
      continue;
    }

    // idempotent: clear this exercise's standards and rewrite, rather than diffing row-by-row
    await db.delete(standards).where(eq(standards.exerciseId, exercise.id));
    for (const [sex, thresholds] of bySex) {
      await db.insert(standards).values(
        thresholds.map((t) => ({
          exerciseId: exercise.id,
          sex,
          metric: entry.isBodyweight ? ("reps" as const) : ("load_ratio" as const),
          tier: t.tier,
          division: t.division,
          threshold: t.threshold,
          trust: t.trust,
        })),
      );
      written += thresholds.length;
    }
  }

  console.log(`standards: wrote ${written} threshold rows across ${entries.length} catalog entries (both sexes where sourced)`);
}
