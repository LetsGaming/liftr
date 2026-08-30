import type { Equipment } from "@liftr/shared";

/**
 * Ports & adapters for equipment enrichment (external-integrations.md's pattern applied to the
 * ingest pipeline): callers depend on this interface, never on a concrete source's fetch/HTTP
 * details. Each adapter fetches its upstream dataset exactly once per ingest run and returns a
 * lookup by its own join key (free-exercise-db's string id / wger's numeric id) — a full index
 * up front rather than one HTTP call per catalog entry, since both upstreams already expose
 * "give me everything" endpoints and the catalog is only ~90 entries against 800+ upstream rows.
 */
export interface EquipmentSourceAdapter {
  /** Used in ingest console output ("resolved via free-exercise-db" / "... via wger") so a
   *  maintainer can see where a value came from, not just that it changed. */
  readonly name: string;
  /** Never throws past this boundary — a source being down/rate-limited degrades to an empty
   *  index (resolveEquipment.ts then just finds nothing there and falls through to the next
   *  source), not an aborted ingest run. */
  buildIndex(): Promise<Map<string, Equipment | null>>;
}
