import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Anchored to this file's own location (packages/server/src or .../dist, both 3 levels below
// the repo root), not process.cwd() — a cwd-relative "../../data/liftr.db" only resolved
// correctly when launched with cwd=packages/server (pnpm --filter's convention); run from the
// repo root instead (`pnpm test`, `vitest`) it escaped the repo entirely, onto a stray db file
// outside version control that then drifted out of sync with the tracked migrations.
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/** Same package.json scripts/bump-version.mjs keeps in sync with the git release tag — the
 *  single source of truth for "what version is this server", exposed via /api/health so a
 *  self-hosted client can detect it was upgraded independently of the server. */
const serverVersion = (
  JSON.parse(readFileSync(path.join(repoRoot, "packages/server/package.json"), "utf8")) as { version: string }
).version;

/** Minimal env config. Auth stays deliberately simple — present, not elaborate. */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  version: serverVersion,
  dbPath: process.env.LIFTR_DB_PATH ?? path.join(repoRoot, "data/liftr.db"),
  imagesDir: process.env.LIFTR_IMAGES_DIR ?? path.join(repoRoot, "data/images"),
  clientDistDir: process.env.LIFTR_CLIENT_DIST ?? path.join(repoRoot, "packages/client/dist"),
  /** Comma-separated allow-list, e.g. "https://liftr.example.com,capacitor://localhost". Unset
   *  (the default) keeps CORS reflecting any origin — low-risk today since auth is a bearer
   *  token in a header, not a cookie, so a malicious page gaining "permission" to call the API
   *  still can't read the token out of another origin's localStorage. Set this once the server
   *  is reachable beyond the reverse proxy's own trusted network to lock CORS down to known
   *  origins for real. */
  allowedOrigins: process.env.LIFTR_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
  /** OpenRouteService: BYO API key for planned-route road-snapping + elevation. Unset is a fully
   *  supported degraded state (straight-line distance, no elevation), since self-hosting without
   *  this key is a legitimate, deliberate choice. */
  orsApiKey: process.env.LIFTR_ORS_API_KEY,
  orsBaseUrl: process.env.LIFTR_ORS_BASE_URL ?? "https://api.openrouteservice.org",
  orsProfile: process.env.LIFTR_ORS_PROFILE ?? "foot-walking",
  /** Off by default: full per-request pino logging is muted (errors/warnings — 4xx/5xx responses
   *  — still log) so routine dev/seed runs don't bloat the log file with a line per request. Set
   *  to "1" for full request-level logging when actually debugging server behavior. */
  verboseLogging: process.env.LIFTR_LOG_VERBOSE === "1",
};
