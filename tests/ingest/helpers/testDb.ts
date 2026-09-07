/** In-memory, fully-migrated DB for ingest-pipeline tests — real SQLite behavior (constraints,
 *  cascades, uniqueness) without touching disk. Mirrors tests/server/helpers/testDb.ts; not
 *  exported from the package's public surface, test files import it directly by relative path. */
import { createDb, runMigrations, type LiftrDb } from "@liftr/db";

export function createTestDb(): LiftrDb {
  const db = createDb(":memory:");
  runMigrations(db);
  return db;
}
