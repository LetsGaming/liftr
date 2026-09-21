/**
 * Shared by dev-up.mjs (read on cache hit, write on cache miss) and seed-mock-data.ts (writes the
 * cache itself once seeding finishes, since it's the one holding the open db handle it needs to
 * checkpoint). Caches the fully-seeded SQLite file that scripts/seed-mock-data.ts produces, keyed
 * by a content hash of everything that can affect what ends up in it, so repeated dev-up.mjs runs
 * within the same code/schema/catalog state can skip straight to copying the file in instead of
 * re-running migrations + catalog ingest + the full mock-data seed pipeline.
 *
 * Deliberately a broad (not precisely dependency-tracked) hash: whole packages rather than only
 * the specific files seed-mock-data.ts happens to import today. Over-invalidating just costs an
 * occasional extra reseed; under-invalidating would silently serve stale mock data from a
 * previous code version, which is the failure mode that actually matters here. Not date-scoped —
 * these dev scripts aren't the layer that cares whether the mock data's timestamps are "fresh";
 * isolation between concurrent sessions is what they're responsible for, and every session still
 * gets its own private copy of whatever cached file it reads (see dev-up.mjs).
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/** Paths (relative to repoRoot) whose content can change what scripts/seed-mock-data.ts produces:
 *  schema/migrations, the ingest + repository/service code it drives, the shared rank/plausibility
 *  math it exercises via the real sync pipeline, the seed script itself, and the catalog data it
 *  ingests. Client code is deliberately excluded — nothing under packages/client runs during
 *  seeding. */
const HASHED_PATHS = [
  "packages/db/drizzle",
  "packages/db/src",
  "packages/ingest/src",
  "packages/server/src",
  "packages/shared/src",
  "scripts/seed-mock-data.ts",
  "scripts/lib/ensureCatalogImages.ts",
  "tools/catalog/curated.yaml",
];

const CACHE_SUBDIR = path.join("data", ".devcache", "seed-db");
/** Bounds cache-dir growth: only the most recently written entries survive a cache-miss write. */
const MAX_CACHE_ENTRIES = 3;

function collectFiles(absPath) {
  const stat = fs.statSync(absPath, { throwIfNoEntry: false });
  if (!stat) return [];
  if (stat.isFile()) return [absPath];
  return fs
    .readdirSync(absPath, { recursive: true })
    .map((rel) => path.join(absPath, rel))
    .filter((p) => fs.statSync(p).isFile());
}

/** Sha256 over sorted (relative-path, content) pairs, truncated to 20 hex chars — enough entropy
 *  for a local, single-machine cache namespace while keeping filenames short. */
export function computeSeedHash(repoRoot) {
  const files = HASHED_PATHS.flatMap((rel) => collectFiles(path.join(repoRoot, rel)))
    .map((abs) => path.relative(repoRoot, abs))
    .sort();

  const hash = createHash("sha256");
  for (const relPath of files) {
    hash.update(relPath.split(path.sep).join("/"));
    hash.update("\0");
    hash.update(fs.readFileSync(path.join(repoRoot, relPath)));
  }
  return hash.digest("hex").slice(0, 20);
}

function cacheDir(repoRoot) {
  return path.join(repoRoot, CACHE_SUBDIR);
}

function cacheFilePath(repoRoot, hash) {
  return path.join(cacheDir(repoRoot), `${hash}.db`);
}

/** Copies the cached snapshot for `hash` to `destDbPath`, if one exists. Returns whether it did. */
export function readSeedCache(repoRoot, hash, destDbPath) {
  const src = cacheFilePath(repoRoot, hash);
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(destDbPath), { recursive: true });
  fs.copyFileSync(src, destDbPath);
  return true;
}

/** Publishes `srcDbPath` (expected already WAL-checkpointed by the caller) as the cached snapshot
 *  for `hash`, via write-to-temp-then-atomic-rename — safe even if another concurrent session is
 *  writing the same hash at the same time, since both would be publishing identical content and
 *  whichever rename lands last just overwrites the other harmlessly. Then prunes older entries. */
export function writeSeedCache(repoRoot, hash, srcDbPath) {
  const dir = cacheDir(repoRoot);
  fs.mkdirSync(dir, { recursive: true });
  const dest = cacheFilePath(repoRoot, hash);
  const tmp = path.join(dir, `.tmp-${hash}-${process.pid}-${Date.now()}`);
  fs.copyFileSync(srcDbPath, tmp);
  fs.renameSync(tmp, dest);
  pruneCache(repoRoot, hash);
}

/** Keeps only the MAX_CACHE_ENTRIES most-recently-written `*.db` entries (the one just written to
 *  `keepHash` always counts as most recent), deleting older ones so the cache dir can't grow
 *  unbounded as the hash naturally drifts across code changes over time. */
function pruneCache(repoRoot, keepHash) {
  const dir = cacheDir(repoRoot);
  const entries = fs
    .readdirSync(dir)
    .filter((name) => name.endsWith(".db"))
    .map((name) => ({ name, mtimeMs: fs.statSync(path.join(dir, name)).mtimeMs }))
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  for (const entry of entries.slice(MAX_CACHE_ENTRIES)) {
    if (entry.name === `${keepHash}.db`) continue;
    fs.rmSync(path.join(dir, entry.name), { force: true });
  }
}
