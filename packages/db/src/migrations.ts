import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { LiftrDb } from "./client.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolves correctly whether this runs from src/ (tsx) or dist/ (built) — both sit one level
// under packages/db, so "../drizzle" always lands on packages/db/drizzle regardless of caller cwd.
const MIGRATIONS_FOLDER = path.join(__dirname, "../drizzle");

/** Applies every pending migration. Safe to call on every process start — drizzle tracks what's
 *  already applied and no-ops the rest, so this is how both the CLI (`pnpm db:migrate`) and the
 *  server's own boot sequence stay on a schema that actually exists (feedback: a fresh clone or
 *  a wiped data/ dir 500'd on "no such table" instead of just working). */
export function runMigrations(db: LiftrDb) {
  migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}
