# Environment Variables

Every environment variable Liftr reads, across the server, db, ingest, and client packages.
Grouped by which part of the app reads them. Source of truth is linked per variable — check there
before trusting a default value written here, since defaults can drift.

Android release signing has its own, separate set of build-time env vars (`LIFTR_KEYSTORE_PATH`,
`LIFTR_KEYSTORE_PASSWORD`, `LIFTR_KEY_ALIAS`, `LIFTR_KEY_PASSWORD`), read by
`packages/client/android/app/build.gradle` and set in CI from GitHub Actions secrets — out of this
doc's scope; see [android-release-signing.md](../operations/android-release-signing.md).

## Server

Source: [`packages/server/src/env.ts`](../../packages/server/src/env.ts) — this is the single
place the server reads `process.env`; everything else in `packages/server/src` imports the
resulting `env` object rather than touching `process.env` directly.

| Variable | Default | Controls |
|---|---|---|
| `PORT` | `3001` | Port the Fastify server listens on. Coerced with `Number(...)`. **Docker:** don't set this in `.env` — it's pinned to `3001` inside the container by `docker-compose.yml`, which forwards `.env` straight into the container's environment; setting a plain `PORT` there moves the app's actual listen port without moving the healthcheck or the container side of the port mapping, breaking both. Set `LIFTR_HOST_PORT` instead to change the externally-published port — see [docker-deployment.md](../operations/docker-deployment.md). |
| `LIFTR_DB_PATH` | `<repo-root>/data/liftr.db` | Path to the SQLite database file. Resolved relative to `env.ts`'s own file location (`import.meta.url`), not `process.cwd()` — stable regardless of where the process is launched from. (A cwd-relative default previously escaped the repo entirely when run from anywhere but `packages/server/`; fixed 2026-09-16.) |
| `LIFTR_IMAGES_DIR` | `<repo-root>/data/images` | Directory the exercise-demo images are mirrored into by `pnpm ingest --images`, and served from at `/images/*`. Same file-location-relative resolution as `LIFTR_DB_PATH`. If the directory doesn't exist at startup, the server logs a warning and skips registering the static file server rather than failing. |
| `LIFTR_CLIENT_DIST` | `<repo-root>/packages/client/dist` | Directory the built client PWA is served from at `/` in production (single self-hosted origin). Same file-location-relative resolution as `LIFTR_DB_PATH`. If it doesn't exist at startup (e.g. dev, where the client runs on its own Vite dev server and proxies `/api` here instead), the server logs a warning and skips registering it. |
| `LIFTR_ALLOWED_ORIGINS` | *(unset → `null`)* | Comma-separated CORS allow-list (e.g. `https://liftr.example.com`), trimmed and empty-filtered per entry. When unset, CORS reflects any origin (`cors` plugin's `origin: true`) — considered low-risk today since auth is a bearer token in a header rather than a cookie, so a page merely being allowed to call the API can't also read the token out of another origin's `localStorage`. Set this once the server is reachable beyond the reverse proxy's own trusted network. The native app's own WebView origins (`https://localhost`, `capacitor://localhost`) are always allowed on top of this list (`corsOrigin` in `app.ts`) — don't add them yourself, and a locked-down list here never blocks the app. |
| `LIFTR_ORS_API_KEY` | *(unset)* | OpenRouteService API key for planned-route road-snapping and elevation. Unset is a fully supported degraded state — straight-line distance, no elevation — not a misconfiguration. See [ADR 0007](../adr/0007-openrouteservice-external-routing-exception.md) and [SECURITY.md](../SECURITY.md). |
| `LIFTR_ORS_BASE_URL` | `https://api.openrouteservice.org` | ORS API base URL — point this at a self-hosted ORS instance to remove the third party entirely, no code change. |
| `LIFTR_ORS_PROFILE` | `foot-walking` | ORS routing profile. |
| `LIFTR_LOG_VERBOSE` | *(unset → off)* | When set to exactly `"1"`, logs every request verbosely; any other value or unset means off. Even when off, 4xx/5xx responses are still logged at `warn` via an `onResponse` hook. |

## Database package (`@liftr/db`)

Source: [`packages/db/src/migrate.ts`](../../packages/db/src/migrate.ts) and
[`packages/db/drizzle.config.ts`](../../packages/db/drizzle.config.ts).

| Variable | Default | Controls |
|---|---|---|
| `LIFTR_DB_PATH` | `<repo-root>/data/liftr.db` | Same variable as the server's, read independently by `pnpm db:migrate` (`migrate.ts`, same file-location-relative default as the server's) and by `drizzle-kit` (`drizzle.config.ts`, used by `pnpm db:generate`) so migrations run against the same file the server itself would open. Keep these in sync when running db commands against a non-default database location. |

## Ingest package (`@liftr/ingest`)

Source: [`packages/ingest/src/index.ts`](../../packages/ingest/src/index.ts) and
[`packages/ingest/src/bootstrap.ts`](../../packages/ingest/src/bootstrap.ts).

| Variable | Default | Controls |
|---|---|---|
| `LIFTR_DB_PATH` | `path.join(REPO_ROOT, "data/liftr.db")` | Same variable, read independently for `pnpm ingest` (catalog ingest) and `pnpm bootstrap` (first-run seed, also run automatically as part of `pnpm dev`). Note the default here is resolved from the repo root (`REPO_ROOT`), not `process.cwd()` — a different resolution strategy than the server's/db's default, though all three land on the same file in the normal case of running from the repo root. |
| `LIFTR_IMAGES_DIR` | `path.join(REPO_ROOT, "data/images")` | Where `pnpm ingest --images` mirrors exercise demo photos to — must match the server's `LIFTR_IMAGES_DIR` for `hasImage` checks (see [http-api.md](./http-api.md#exercises-exercisests)) to find them. |

## Client (`@liftr/client`)

No environment variables — `apiBase()` in
[`packages/client/src/lib/api.ts`](../../packages/client/src/lib/api.ts) is `""` (same-origin) on
web, and on native reads whatever server URL the user entered and verified at runtime via
`ServerGate.vue`/`useServerConnection.ts`, never baked in at build time (a previous
`VITE_API_BASE` build-time variable served this purpose; removed since a native build no longer
needs to know its backend in advance). Both the session token and the server URL live in
`localStorage` (`liftr.token`, `liftr.serverUrl`) — the token obtained by logging in (or
completing first-run owner setup) via `AuthGate.vue`, the server URL by `ServerGate.vue`'s
first-launch connection screen (native only; the web build has no such screen, same-origin is
always correct there).

## Not environment-configured

`NODE_ENV` isn't read anywhere in `packages/server/src/env.ts` — Vite/vue-tsc/vitest set it
implicitly per their own conventions (e.g. `vite build` sets `NODE_ENV=production` for the client
build), but nothing server-side changes behavior based on it.
