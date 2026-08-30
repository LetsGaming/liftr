import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import * as schema from "./schema.js";

export function createDb(filePath: string) {
  // better-sqlite3 throws "Cannot open database because the directory does not exist" rather
  // than creating it — data/ is gitignored (local-only, never committed), so a fresh clone or a
  // wiped local data dir must not require a manual `mkdir` before the app can start.
  if (filePath !== ":memory:") mkdirSync(dirname(filePath), { recursive: true });
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle({ client: sqlite, schema });
}

export type LiftrDb = ReturnType<typeof createDb>;
export { schema };
