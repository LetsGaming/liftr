# Environment Variables

Every environment variable Liftr reads, across the server, db, ingest, and client packages.
Grouped by which part of the app reads them. Source of truth is linked per variable — check there
before trusting a default value written here, since defaults can drift.

## Server

Source: [`packages/server/src/env.ts`](../../packages/server/src/env.ts) — this is the single
place the server reads `process.env`; everything else in `packages/server/src` imports the
resulting `env` object rather than touching `process.env` directly.

| Variable | Default | Controls |
|---|---|---|
| `PORT` | `3001` | Port the Fastify server listens on. Coerced with `Number(...)`. |
| `LIFTR_DB_PATH` | `../../data/liftr.db` | Path to the SQLite database file. Resolved relative to `process.cwd()` at the point the db client opens it — i.e. relative to wherever the server process was launched from (typically `packages/server/` under `pnpm --filter @liftr/server dev`), **not** relative to `env.ts`'s own location. |
| `LIFTR_TOKEN` | *(unset)* | The single bearer token checked on every `/api/*` request (see [http-api.md](./http-api.md#auth)). **Required in production** — see [Production requirement](#production-requirement) below. When unset, auth is skipped entirely (dev-mode / test-mode behavior). |
| `LIFTR_IMAGES_DIR` | `../../data/images` | Directory the exercise-demo images are mirrored into by `pnpm ingest --images`, and served from at `/images/*`. Same `process.cwd()`-relative resolution as `LIFTR_DB_PATH`. If the directory doesn't exist at startup, the server logs a warning and skips registering the static file server rather than failing. |
| `LIFTR_CLIENT_DIST` | `../../packages/client/dist` | Directory the built client PWA is served from at `/` in production (single self-hosted origin). If it doesn't exist at startup (e.g. dev, where the client runs on its own Vite dev server and proxies `/api` here instead), the server logs a warning and skips registering it. |
| `LIFTR_ALLOWED_ORIGINS` | *(unset → `null`)* | Comma-separated CORS allow-list (e.g. `https://liftr.example.com,capacitor://localhost`), trimmed and empty-filtered per entry. When unset, CORS reflects any origin (`cors` plugin's `origin: true`) — considered low-risk today since auth is a bearer token in a header rather than a cookie, so a page merely being allowed to call the API can't also read the token out of another origin's `localStorage`. Set this once the server is reachable beyond the reverse proxy's own trusted network. |

### Production requirement

`env.ts` throws at import time — i.e. the server refuses to start — if `LIFTR_TOKEN` is unset
**and** `NODE_ENV=production`:

```
LIFTR_TOKEN must be set in production — the homelab reverse proxy is not a substitute.
```

`NODE_ENV` itself isn't read anywhere else in `env.ts`; it's only this one guard. In any other
`NODE_ENV` (including unset), an unset `LIFTR_TOKEN` is silently allowed and auth is skipped —
this is what makes local dev and the vitest test suite (`tests/server/helpers/testApp.ts`, which
never sets `LIFTR_TOKEN`) work without configuring a token.

## Database package (`@liftr/db`)

Source: [`packages/db/src/migrate.ts`](../../packages/db/src/migrate.ts) and
[`packages/db/drizzle.config.ts`](../../packages/db/drizzle.config.ts).

| Variable | Default | Controls |
|---|---|---|
| `LIFTR_DB_PATH` | `../../data/liftr.db` | Same variable as the server's, read independently by `pnpm db:migrate` (`migrate.ts`) and by `drizzle-kit` (`drizzle.config.ts`, used by `pnpm db:generate`) so migrations run against the same file the server itself would open. Keep these in sync when running db commands against a non-default database location. |

## Ingest package (`@liftr/ingest`)

Source: [`packages/ingest/src/index.ts`](../../packages/ingest/src/index.ts) and
[`packages/ingest/src/bootstrap.ts`](../../packages/ingest/src/bootstrap.ts).

| Variable | Default | Controls |
|---|---|---|
| `LIFTR_DB_PATH` | `path.join(REPO_ROOT, "data/liftr.db")` | Same variable, read independently for `pnpm ingest` (catalog ingest) and `pnpm bootstrap` (first-run seed, also run automatically as part of `pnpm dev`). Note the default here is resolved from the repo root (`REPO_ROOT`), not `process.cwd()` — a different resolution strategy than the server's/db's default, though all three land on the same file in the normal case of running from the repo root. |
| `LIFTR_IMAGES_DIR` | `path.join(REPO_ROOT, "data/images")` | Where `pnpm ingest --images` mirrors exercise demo photos to — must match the server's `LIFTR_IMAGES_DIR` for `hasImage` checks (see [http-api.md](./http-api.md#exercises-exercisests)) to find them. |

## Client (`@liftr/client`)

Source: [`packages/client/src/lib/api.ts`](../../packages/client/src/lib/api.ts), read via Vite's
`import.meta.env` (build-time, not `process.env`).

| Variable | Default | Controls |
|---|---|---|
| `VITE_API_BASE` | *(unset → `""`)* | Base URL prepended to every API request. Empty string in the normal browser/dev-server case, so the Vite dev-server proxy (`/api` → `http://localhost:3001`, configured in [`vite.config.ts`](../../packages/client/vite.config.ts)) keeps working unchanged. Only needs to be set to an absolute LAN server URL for a Capacitor native build, where there's no dev-server proxy available on-device. Set at build time (Vite inlines `import.meta.env.*` into the bundle) — not a runtime-configurable value. |

No other `VITE_*` variables are read anywhere in `packages/client/src`. The auth token itself is
*not* an env var — it's entered once at runtime via `AuthGate.vue` on the app's first `401` and
stored in `localStorage` (`liftr.token`), independent of how the server's own `LIFTR_TOKEN` got
configured.

## Not environment-configured

`NODE_ENV` is read only by the server's production guard above — Vite/vue-tsc/vitest set it
implicitly per their own conventions (e.g. `vite build` sets `NODE_ENV=production` for the client
build), but nothing in this repo reads it to change behavior beyond that one throw in `env.ts`.
