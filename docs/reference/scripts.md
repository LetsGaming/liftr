# Scripts Reference

Every `pnpm` script a developer would actually run, grouped by purpose. Root-level scripts are run
from the repo root; package-level scripts can be run either via `pnpm --filter <package> run
<script>` or by `cd`-ing into that package's directory. Source: root
[`package.json`](../../package.json) and each package's own `package.json`
(`packages/{client,server,db,ingest,shared}/package.json`).

## Dev

| Command | What it does |
|---|---|
| `pnpm dev` | The everyday entry point. Runs `pnpm bootstrap` first (seeds the db if needed), then starts the server (`tsx watch src/index.ts`) and client (Vite dev server) concurrently, labeled `server`/`client` in the combined output. Reach for this to work on anything end-to-end. |
| `pnpm --filter @liftr/server dev` | Server only: `tsx watch src/index.ts` — auto-restarts on file change. Listens on `PORT` (default `3001`); see [environment-variables.md](./environment-variables.md). |
| `pnpm --filter @liftr/client dev` | Client only: `vite`. Proxies `/api` and `/images` to `http://localhost:3001` (`vite.config.ts`), so the server needs to be running separately for API calls to resolve — use `pnpm dev` instead unless you specifically want the client alone (e.g. iterating on a page that doesn't hit the API). |

## Build

| Command | What it does |
|---|---|
| `pnpm build` | Builds every package under `packages/*` (`pnpm -r --filter=./packages/* build`). Reach for this before a production deploy, or to sanity-check the whole workspace compiles as a unit. |
| `pnpm --filter @liftr/client build` | `vue-tsc -b && vite build` — typechecks (project-referenced build mode) then bundles the PWA to `packages/client/dist`. This is what `LIFTR_CLIENT_DIST` on the server points at in production. |
| `pnpm --filter @liftr/server build` | `tsc -p tsconfig.json` — compiles `src/` to `dist/`, consumed by `pnpm --filter @liftr/server start` (`node dist/index.js`). |
| `pnpm --filter @liftr/db build` | `tsc -p tsconfig.json`. |
| `pnpm --filter @liftr/ingest build` | `tsc -p tsconfig.json`. |
| `pnpm --filter @liftr/shared build` | `tsc -p tsconfig.json`. |
| `pnpm --filter @liftr/server start` | `node dist/index.js` — runs the *built* server (not `tsx`). Requires `pnpm --filter @liftr/server build` to have run first. This is the production start command. |

## Test

| Command | What it does |
|---|---|
| `pnpm test` | `vitest run` — the full suite, once, across every package (tests live under `tests/`, mirroring `packages/<pkg>/src/...`; see [`tests/README.md`](../../tests/README.md)). Reach for this before committing/pushing. |
| `pnpm test:watch` | `vitest` in watch mode — reach for this while actively writing/fixing a test or the code it covers. |

## Lint / typecheck

| Command | What it does |
|---|---|
| `pnpm lint` | `eslint .` over the whole repo. |
| `pnpm typecheck` | The full typecheck chain: each package's own `typecheck` script (`pnpm -r --filter=./packages/* run typecheck`), then `pnpm typecheck:tests`. Reach for this as the final check before considering a change done — it's the closest single command to "does everything still typecheck." |
| `pnpm typecheck:tests` | Typechecks the `tests/` tree itself, per package, since test files aren't covered by any individual package's own `typecheck` script (which only points at that package's `src/`). Runs, in order: `tsc --noEmit -p packages/shared/tsconfig.test.json`, `tsc --noEmit -p packages/db/tsconfig.test.json`, `tsc --noEmit -p packages/ingest/tsconfig.test.json`, `tsc --noEmit -p packages/server/tsconfig.test.json`, then `pnpm --filter @liftr/client exec vue-tsc --noEmit -p tsconfig.test.json` for the client tests (needs `vue-tsc`, not plain `tsc`, because client tests import `.vue` components). Each `tsconfig.test.json` is a package-scoped config that adds `tests/<pkg>/**` to the include set and wires up the `~server`/`~client`/`~ingest` path aliases described in `tests/README.md`, without changing what that package's own `src/`-only `tsconfig.json` covers. Reach for this specifically when you've changed test code (not app code) and want a fast typecheck without running the whole `pnpm typecheck` chain — or when `pnpm typecheck` fails and you need to know whether the failure is in `src/` or in `tests/`. |
| `pnpm --filter @liftr/client typecheck` | `vue-tsc --noEmit` — client `src/` only, not tests. |
| `pnpm --filter @liftr/server typecheck` | `tsc --noEmit` — server `src/` only, not tests. |
| `pnpm --filter @liftr/db typecheck` | `tsc --noEmit`. |
| `pnpm --filter @liftr/ingest typecheck` | `tsc --noEmit`. |
| `pnpm --filter @liftr/shared typecheck` | `tsc --noEmit`. |

## Database

| Command | What it does |
|---|---|
| `pnpm db:generate` | `pnpm --filter @liftr/db generate` → `drizzle-kit generate`. Reach for this after changing a Drizzle schema (`packages/db/src/schema.ts`) to generate the corresponding SQL migration file. |
| `pnpm db:migrate` | `pnpm --filter @liftr/db migrate` → `tsx src/migrate.ts`. Applies pending migrations to the database at `LIFTR_DB_PATH`. Reach for this after pulling changes that include a new migration, or after `db:generate`. |

## Ingest

| Command | What it does |
|---|---|
| `pnpm ingest` | `pnpm --filter @liftr/ingest start` → `tsx src/index.ts`. Runs the exercise-catalog ingest (and, with `--images`, mirrors demo photos into `LIFTR_IMAGES_DIR` — see that route's notes in [http-api.md](./http-api.md#exercises-exercisests); and, with `--run-standards`, (re)writes the whole `run_standards` table so running rank/PR recompute has thresholds to resolve against). Reach for this after editing the catalog source data, or on a fresh checkout before the exercise list will show anything. |
| `pnpm bootstrap` | `pnpm --filter @liftr/ingest bootstrap` → `tsx src/bootstrap.ts`. First-run seed — also invoked automatically as the first step of `pnpm dev`, so you don't normally need to run it by hand. |

## Other

| Command | What it does |
|---|---|
| `pnpm recompute` | `pnpm --filter @liftr/server recompute` → `tsx src/recompute.ts`. Recomputes ranks/XP from scratch against existing logged data — reach for this after a change to the rank engine or XP formula that should retroactively apply to history, not just new activity. |
