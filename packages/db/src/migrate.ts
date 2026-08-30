import { createDb } from "./client.js";
import { runMigrations } from "./migrations.js";

const dbPath = process.env.LIFTR_DB_PATH ?? "../../data/liftr.db";
const db = createDb(dbPath);

runMigrations(db);
console.log(`Migrated ${dbPath}`);
