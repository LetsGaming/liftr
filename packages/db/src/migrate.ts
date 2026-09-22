import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "./client.js";
import { runMigrations } from "./migrations.js";
import { resolveDbPath, warnIfDefaultDbPath } from "./resolveDbPath.js";

// Anchored to this file's own location, not process.cwd() — see env.ts's identical fix for why
// a cwd-relative path here escaped the repo when run from anywhere but packages/db.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const resolved = resolveDbPath(repoRoot);
warnIfDefaultDbPath(resolved); // loud, BEFORE the migration runs — see resolveDbPath.ts's header
const dbPath = resolved.path;
const db = createDb(dbPath);

runMigrations(db);
console.log(`Migrated ${dbPath}`);
