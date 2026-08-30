/**
 * One-time (re-runnable) helper: `tsx src/matchWgerIds.ts` — populates curated.yaml's `wgerId`
 * for every entry that doesn't have one yet, so the ingest pipeline can pull the *full*
 * multi-item equipment tag list wger already carries per exercise (see wgerSource.ts's
 * wgerFullEquipmentSource) instead of guessing via deriveRequirements()'s slug/pattern rules.
 *
 * Same "fuzzy-matched then manually checked" approach curated.yaml's own header comment
 * documents for freeExerciseDbId: try an exact English-name lookup first (wger's own `name`
 * filter is exact-match only), fall back to token-overlap fuzzy scoring against the full
 * English translation list for everything that doesn't hit exactly, auto-accept only
 * high-confidence matches, and print the rest for manual review rather than guessing — some
 * entries staying unresolved is expected and fine (same as freeExerciseDbId's "12 exercises
 * left with no id on purpose").
 *
 * Read-only against curated.yaml: prints a report + ready-to-paste `wgerId:` lines, doesn't
 * write the file itself (this is the one genuinely manual step in the equipment-tier feature —
 * see the project plan).
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { catalogFileSchema } from "./catalogSchema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = path.join(__dirname, "../../../tools/catalog/curated.yaml");
const API_BASE = "https://wger.de/api/v2";

interface WgerTranslation {
  id: number;
  name: string;
  exercise: number;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`wger fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json() as Promise<T>;
}

async function fetchExactMatch(nameEn: string): Promise<number | null> {
  const url = `${API_BASE}/exercise-translation/?language=2&name=${encodeURIComponent(nameEn)}&format=json`;
  const page = await fetchJson<{ count: number; results: WgerTranslation[] }>(url);
  return page.count === 1 ? page.results[0]!.exercise : null;
}

async function fetchAllEnglishTranslations(): Promise<WgerTranslation[]> {
  const rows: WgerTranslation[] = [];
  let url: string | null = `${API_BASE}/exercise-translation/?language=2&limit=250&format=json`;
  while (url) {
    const page: { results: WgerTranslation[]; next: string | null } = await fetchJson(url);
    rows.push(...page.results);
    url = page.next;
  }
  return rows;
}

/** Trailing-"s" plural stemming ("Dips"->"dip") — deliberately conservative (skips short words
 *  and anything ending "ss") so it never mangles a real word into a false match, just closes the
 *  singular/plural gap that was otherwise scoring e.g. "Ring Dip" vs "Ring Dips" as barely
 *  related. */
function stem(word: string): string {
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[()]/g, "")
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/[\s-]+/)
      .filter(Boolean)
      .map(stem),
  );
}

/**
 * Two scores combined, whichever is higher: plain Jaccard (good for "same words, different
 * order"), and containment *anchored to the curated name* (intersection / curated's own token
 * count — good for "wger's official name adds a qualifier", e.g. curated's "Incline Bench Press"
 * fully contained in wger's "Incline Bench Press - Barbell"). Deliberately asymmetric: it only
 * rewards wger's candidate for containing *every* curated token, never the reverse — an earlier
 * version anchored to whichever set was smaller instead, which let a short generic wger entry
 * ("Bench Press") falsely max out containment against a more specific curated name ("Incline
 * Bench Press") just because its 2 words happened to both appear, silently losing the "incline".
 *
 * The containment boost is further capped to candidates adding at most one extra word beyond
 * curated's own token count — without this, a short 2-word curated name ("Barbell Curl") would
 * containment-match against an unrelated, more specific exercise that just happens to be a
 * superset ("Barbell Reverse Wrist Curl"), or "Lat Pulldown" against a niche single-arm
 * half-kneeling variant — two extra qualifier words is usually a genuinely different exercise,
 * not the same one under a fuller name.
 */
function tokenOverlapScore(curatedName: string, candidateName: string): number {
  const setA = tokenize(curatedName);
  const setB = tokenize(candidateName);
  const intersection = [...setA].filter((t) => setB.has(t)).length;
  const union = new Set([...setA, ...setB]).size;
  const jaccard = union === 0 ? 0 : intersection / union;
  const containment = setA.size === 0 || setB.size - setA.size > 1 ? 0 : intersection / setA.size;
  return Math.max(jaccard, containment * 0.85);
}

const FUZZY_ACCEPT_THRESHOLD = 0.85;

async function main() {
  const raw = await readFile(CATALOG_PATH, "utf-8");
  const catalog = catalogFileSchema.parse(parseYaml(raw));
  const unmatched = catalog.exercises.filter((e) => e.wgerId == null);

  if (unmatched.length === 0) {
    console.log("every curated.yaml entry already has a wgerId — nothing to do.");
    return;
  }

  console.log(`${unmatched.length} entries without a wgerId, ${catalog.exercises.length - unmatched.length} already set. Matching...\n`);

  const accepted: { slug: string; wgerId: number; matchedName: string; via: "exact" | "fuzzy" }[] = [];
  const flagged: { slug: string; nameEn: string; bestGuess?: { name: string; wgerId: number; score: number } }[] = [];

  let allTranslations: WgerTranslation[] | null = null;

  for (const entry of unmatched) {
    const exactId = await fetchExactMatch(entry.nameEn);
    if (exactId != null) {
      accepted.push({ slug: entry.slug, wgerId: exactId, matchedName: entry.nameEn, via: "exact" });
      continue;
    }

    allTranslations ??= await fetchAllEnglishTranslations();
    let best: { name: string; wgerId: number; score: number } | null = null;
    for (const t of allTranslations) {
      const score = tokenOverlapScore(entry.nameEn, t.name);
      if (!best || score > best.score) best = { name: t.name, wgerId: t.exercise, score };
    }

    if (best && best.score >= FUZZY_ACCEPT_THRESHOLD) {
      accepted.push({ slug: entry.slug, wgerId: best.wgerId, matchedName: best.name, via: "fuzzy" });
    } else {
      flagged.push({ slug: entry.slug, nameEn: entry.nameEn, bestGuess: best ?? undefined });
    }
  }

  console.log(`=== auto-accepted (${accepted.length}) — paste into curated.yaml as wgerId: N ===`);
  for (const a of accepted) {
    console.log(`  ${a.slug}: wgerId: ${a.wgerId}  (${a.via}, matched "${a.matchedName}")`);
  }

  console.log(`\n=== needs manual review (${flagged.length}) — left as null, deriveRequirements() rules still apply ===`);
  for (const f of flagged) {
    const guess = f.bestGuess ? ` — best guess: "${f.bestGuess.name}" (id ${f.bestGuess.wgerId}, score ${f.bestGuess.score.toFixed(2)})` : "";
    console.log(`  ${f.slug} ("${f.nameEn}")${guess}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
