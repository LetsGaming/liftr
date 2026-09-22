import { fileURLToPath } from "node:url";
import path from "node:path";
import { defineConfig } from "drizzle-kit";
import { resolveDbPath, warnIfDefaultDbPath } from "./src/resolveDbPath.js";

// Anchored to this file's own location, not process.cwd() — see env.ts's identical fix for why
// a cwd-relative path here escaped the repo when drizzle-kit is invoked from anywhere but
// packages/db.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const resolved = resolveDbPath(repoRoot);
warnIfDefaultDbPath(resolved); // loud — matters for `drizzle-kit studio`/`push`, which mutate

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
  dbCredentials: {
    url: resolved.path,
  },
});
