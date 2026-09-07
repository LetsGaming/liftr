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
 *  a wiped data/ dir 500'd on "no such table" instead of just working).
 *
 *  `migrate()` runs every pending migration file inside ONE `session.transaction(...)` (verified
 *  directly in drizzle-orm's sqlite dialect). SQLite ignores `PRAGMA foreign_keys` *inside* a
 *  transaction, so a generated migration's own `PRAGMA foreign_keys=OFF` header (drizzle-kit
 *  emits one at the top of any table-recreate migration) is a silent no-op — FK enforcement
 *  stays on, and a recreate's `DROP TABLE` then cascades onto every child row instead of just
 *  the table being rebuilt. Toggling the pragma from out here, before `migrate()` opens its own
 *  transaction, is what actually disables it. The `foreign_key_check` afterward is the backstop:
 *  cheap, and it's the only thing that would catch a mis-ordered or mis-written recreate leaving
 *  orphaned rows instead of failing loudly. */
export function runMigrations(db: LiftrDb) {
  db.$client.pragma("foreign_keys = OFF");
  try {
    migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  } finally {
    db.$client.pragma("foreign_keys = ON");
  }
  const violations = db.$client.pragma("foreign_key_check") as unknown[];
  if (violations.length > 0) {
    throw new Error(`runMigrations: foreign_key_check found ${violations.length} violation(s) after migrating`);
  }
}
