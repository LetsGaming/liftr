/**
 * Single source of truth for resolving which SQLite file a script/server talks to, shared by
 * every entry point that reads `LIFTR_DB_PATH` (migrate.ts, drizzle.config.ts, ingest's
 * bootstrap.ts/index.ts, server's env.ts). Before this existed, each of those five places
 * silently fell back to the shared `data/liftr.db` default with no indication the env var was
 * even considered — so a wrong/misspelled variable name (e.g. `DATABASE_PATH` instead of
 * `LIFTR_DB_PATH`) looked identical to "intentionally targeting the default database," and the
 * only trace was the resolved path buried in whatever the script printed *after* it had already
 * run. That's exactly how an agent session once ran a migration against the shared default DB
 * instead of its own isolated one (see CLAUDE.md's "Never point a manually-started pnpm dev at
 * the default ports/database" rule) — the fallback itself is legitimate (the maintainer's own
 * single-instance `pnpm dev` relies on it), so this doesn't remove it; it just makes it loud.
 */
import path from "node:path";

export interface ResolvedDbPath {
  path: string;
  /** True when LIFTR_DB_PATH was unset/empty and the shared default was used instead. */
  usedDefault: boolean;
}

/** @param repoRoot Absolute path to the repo root, so the default resolves to `<repoRoot>/data/liftr.db`
 *  regardless of the caller's own file location or process.cwd() (each call site already computes
 *  this via `import.meta.url`, since a cwd-relative default has previously escaped the repo). */
export function resolveDbPath(repoRoot: string): ResolvedDbPath {
  const explicit = process.env.LIFTR_DB_PATH;
  if (explicit) return { path: explicit, usedDefault: false };
  return { path: path.join(repoRoot, "data/liftr.db"), usedDefault: true };
}

/** Prints a loud, hard-to-miss warning when falling back to the shared default database — call
 *  this BEFORE doing anything with the resolved path, not after, so a misconfigured env var is
 *  visible before any write happens rather than buried in a post-hoc log line. */
export function warnIfDefaultDbPath(resolved: ResolvedDbPath): void {
  if (!resolved.usedDefault) return;
  console.warn(
    `⚠ LIFTR_DB_PATH is not set — falling back to the SHARED default database at ${resolved.path}\n` +
      `  This is almost certainly wrong for an isolated dev session or an agent run. If you meant\n` +
      `  to target a specific database, double check the env var name is exactly LIFTR_DB_PATH\n` +
      `  (a typo like DATABASE_PATH is silently ignored, not an error) and that its value is set.`,
  );
}
