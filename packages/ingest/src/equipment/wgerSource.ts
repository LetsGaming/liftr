/**
 * wger (wger.de/api/v2, CC-BY-SA 4.0) — the same project ingestMuscleAssets.ts already mirrors
 * muscle-map SVGs from. Live paginated REST API rather than a static dataset dump, keyed by
 * curated.yaml's `wgerId` (wger's own numeric exercise id) — that field exists in the schema
 * already but nothing has joined on it until now (see catalogSchema.ts's doc comment).
 *
 * Two calls' worth of shape: `/equipment/` once for the small id->name lookup (12 rows), then
 * `/exercise/` paginated for the id->equipment-id[] rows (861 rows at the time this was written,
 * a handful of pages at the API's own max page size) — the lean `exercise` endpoint, not the
 * heavier `exerciseinfo` one, since muscles/translations/images aren't needed here.
 */
import { normalizeWgerEquipment, type Equipment } from "@liftr/shared";
import type { EquipmentSourceAdapter } from "./types.js";

const API_BASE = "https://wger.de/api/v2";
const PAGE_SIZE = 250;

interface WgerEquipment {
  id: number;
  name: string;
}

interface WgerExerciseRow {
  id: number;
  equipment: number[];
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wger fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json() as Promise<T>;
}

async function fetchAllExercises(): Promise<WgerExerciseRow[]> {
  const rows: WgerExerciseRow[] = [];
  let url: string | null = `${API_BASE}/exercise/?format=json&limit=${PAGE_SIZE}`;
  while (url) {
    const page: { results: WgerExerciseRow[]; next: string | null } = await fetchJson(url);
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

export const wgerEquipmentSource: EquipmentSourceAdapter = {
  name: "wger",

  async buildIndex(): Promise<Map<string, Equipment | null>> {
    const [equipmentTypes, exerciseRows] = await Promise.all([
      fetchJson<{ results: WgerEquipment[] }>(`${API_BASE}/equipment/?format=json&limit=100`).then((r) => r.results),
      fetchAllExercises(),
    ]);
    const nameById = new Map(equipmentTypes.map((e) => [e.id, e.name]));

    const index = new Map<string, Equipment | null>();
    for (const row of exerciseRows) {
      const names = row.equipment.map((id) => nameById.get(id)).filter((n): n is string => !!n);
      index.set(String(row.id), normalizeWgerEquipment(names));
    }
    return index;
  },
};

/**
 * Un-collapsed sibling of wgerEquipmentSource above: same two calls, but the index value is the
 * *full* per-exercise equipment name list (e.g. ["Barbell", "Bench"]) instead of one
 * priority-reduced value — feeds @liftr/shared's mapWgerEquipmentToRequirements() so a joined
 * exercise's requiredEquipment tiers can come from wger's real tagging instead of
 * deriveRequirements()'s slug/pattern rules (see ingestCatalog.ts). Kept as a separate function
 * rather than folded into wgerEquipmentSource's buildIndex so the single-value `equipment`
 * column and the tiered `requiredEquipment` column stay independently swappable/testable.
 */
export async function fetchWgerFullEquipmentIndex(): Promise<Map<string, string[]>> {
  const [equipmentTypes, exerciseRows] = await Promise.all([
    fetchJson<{ results: WgerEquipment[] }>(`${API_BASE}/equipment/?format=json&limit=100`).then((r) => r.results),
    fetchAllExercises(),
  ]);
  const nameById = new Map(equipmentTypes.map((e) => [e.id, e.name]));

  const index = new Map<string, string[]>();
  for (const row of exerciseRows) {
    const names = row.equipment.map((id) => nameById.get(id)).filter((n): n is string => !!n);
    index.set(String(row.id), names);
  }
  return index;
}
