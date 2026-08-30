import { createDb, runMigrations } from "@liftr/db";
import { env } from "./env.js";

export const db = createDb(env.dbPath);
export type AppDb = typeof db;

// Feedback: a fresh clone or a wiped data/ dir 500'd on every route with "no such table" since
// nothing ever ran the migrations automatically. Applying them here (module-load time, before
// any route can be hit) means the server works out of the box in dev and in prod, regardless of
// whether the caller remembered `pnpm db:migrate` first. drizzle tracks what's already applied,
// so this is a no-op on every subsequent boot.
runMigrations(db);
