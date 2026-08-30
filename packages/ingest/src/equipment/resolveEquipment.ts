/**
 * Orchestrates the equipment adapters (feedback: "map equipment to exercises without manually
 * adjusting the code every time"). curated.yaml's own `equipment:` stays authoritative when set
 * — this only fills in entries that leave it null, and cross-checks the rest so a hand-set value
 * that's drifted from what the upstreams now say gets surfaced instead of silently ignored.
 * Non-destructive by design: this never writes back into curated.yaml (that would blur "hand-
 * curated" vs "auto-derived" provenance and fight manual edits with git churn) — it only affects
 * what ingestCatalog.ts writes into the `exercises` table.
 */
import type { Equipment } from "@liftr/shared";
import type { CatalogEntry } from "../catalogSchema.js";
import type { EquipmentSourceAdapter } from "./types.js";

export interface EquipmentResolutionSummary {
  handSet: number;
  resolvedFromSource: number;
  unresolved: string[];
  /** A curated.yaml value that disagrees with what an upstream source says — logged, not
   *  auto-corrected, since curated.yaml wins on purpose (it may know something the upstream
   *  general-purpose tag doesn't, e.g. this app's specific movement variant). */
  conflicts: { slug: string; curated: Equipment; source: string; sourceValue: Equipment }[];
}

/** Join key each source's index is keyed by, per catalog entry — null skips that source for
 *  this entry (e.g. no wgerId hand-verified yet, same gap curated.yaml's own doc comment notes). */
function joinKeyFor(sourceName: string, entry: CatalogEntry): string | null {
  if (sourceName === "free-exercise-db") return entry.freeExerciseDbId;
  if (sourceName === "wger") return entry.wgerId != null ? String(entry.wgerId) : null;
  return null;
}

export async function resolveEquipmentForCatalog(
  entries: CatalogEntry[],
  sources: EquipmentSourceAdapter[],
): Promise<{ equipmentBySlug: Map<string, Equipment | null>; summary: EquipmentResolutionSummary }> {
  const indexes = new Map<string, Map<string, Equipment | null>>();
  for (const source of sources) {
    try {
      indexes.set(source.name, await source.buildIndex());
    } catch (err) {
      // Degrade, don't fail (external-integrations.md) — one upstream being down/rate-limited
      // shouldn't abort the whole catalog ingest; entries just fall through to the next source
      // or stay unresolved, same as if this source had never been wired in at all.
      console.warn(`  ! equipment source "${source.name}" unavailable, skipping: ${err instanceof Error ? err.message : err}`);
    }
  }

  const summary: EquipmentResolutionSummary = { handSet: 0, resolvedFromSource: 0, unresolved: [], conflicts: [] };
  const equipmentBySlug = new Map<string, Equipment | null>();

  for (const entry of entries) {
    const curated = entry.equipment as Equipment | null;

    // Conflict check runs regardless of whether curated.yaml already has a value — a hand-set
    // value silently drifting from what every upstream now agrees on is exactly the kind of
    // thing "don't manually adjust every time" is asking to catch, not just fill blanks.
    for (const source of sources) {
      const index = indexes.get(source.name);
      const key = index ? joinKeyFor(source.name, entry) : null;
      const sourceValue = key ? (index!.get(key) ?? null) : null;
      if (curated && sourceValue && sourceValue !== curated) {
        summary.conflicts.push({ slug: entry.slug, curated, source: source.name, sourceValue });
      }
    }

    if (curated) {
      summary.handSet++;
      equipmentBySlug.set(entry.slug, curated);
      continue;
    }

    let resolved: Equipment | null = null;
    for (const source of sources) {
      const index = indexes.get(source.name);
      const key = index ? joinKeyFor(source.name, entry) : null;
      const value = key ? index!.get(key) : null;
      if (value) {
        resolved = value;
        break;
      }
    }

    equipmentBySlug.set(entry.slug, resolved);
    if (resolved) summary.resolvedFromSource++;
    else summary.unresolved.push(entry.slug);
  }

  return { equipmentBySlug, summary };
}

export function logEquipmentResolutionSummary(summary: EquipmentResolutionSummary) {
  console.log(
    `equipment: ${summary.handSet} hand-set, ${summary.resolvedFromSource} auto-resolved, ${summary.unresolved.length} unresolved`,
  );
  if (summary.unresolved.length > 0) {
    console.log(`  unresolved: ${summary.unresolved.join(", ")}`);
  }
  for (const c of summary.conflicts) {
    console.warn(`  ! equipment mismatch for "${c.slug}": curated.yaml says "${c.curated}", ${c.source} says "${c.sourceValue}" — kept curated.yaml`);
  }
}
