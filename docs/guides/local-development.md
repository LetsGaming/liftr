# Local development

How to get Liftr running on your own machine for development.

## Prerequisites

- **Node.js >= 20** — the exact constraint lives in the root [`package.json`](../../package.json)'s
  `engines` field; anything older isn't supported.
- **pnpm** — this is a pnpm monorepo (workspaces under `packages/*`). If you don't have it,
  install it however you normally manage Node tooling (`corepack enable`, a global install, etc).

No other services are required. There's no external database, no Docker Compose stack, nothing to
sign up for — Liftr's whole backing store is a single SQLite file (see
[SQLite database](#sqlite-database--migrations) below).

## Install

```bash
pnpm install
```

Installs dependencies for every workspace package (`client`, `server`, `db`, `shared`, `ingest`)
in one pass.

## Run it

```bash
pnpm dev
```

This is the one command you need. Per the root `package.json`'s `dev` script, it does two things
in sequence:

1. **`pnpm bootstrap`** first (see [Bootstrap: first-run data seeding](#bootstrap-first-run-data-seeding)
   below) — makes sure the database exists, is migrated, and has the exercise catalog loaded.
2. Then starts the Fastify API and the Vue client **together**, via `concurrently`:
   - `@liftr/server dev` → `tsx watch src/index.ts`, the API on `http://localhost:3001`
     (default `PORT`, see [`packages/server/src/env.ts`](../../packages/server/src/env.ts))
   - `@liftr/client dev` → `vite`, the client dev server on Vite's default port (`5173`)

Open the client's dev URL in your browser; that's the app.

### How the client talks to the server in dev

The client doesn't hardcode the API's origin. Vite's dev server proxies requests for it, per
[`packages/client/vite.config.ts`](../../packages/client/vite.config.ts)'s `server.proxy` block:

```ts
server: {
  proxy: {
    "/api": "http://localhost:3001",
    "/images": "http://localhost:3001",
  },
},
```

Any request the client makes to `/api/...` or `/images/...` is transparently forwarded to the
Fastify server on port 3001. This means the client code never needs to know the server's address
(in dev or in production, where the server serves the built client directly — see
`clientDistDir` in `env.ts`), and there's no CORS dance to worry about locally.

## Bootstrap: first-run data seeding

`pnpm bootstrap` (`packages/ingest/src/bootstrap.ts`) is what turns an empty checkout into a
working instance. It:

1. Opens the SQLite db (creating the file if needed) and runs migrations
   (`runMigrations`, from `@liftr/db`).
2. Checks whether the `exercises` table already has rows.
   - **If yes**, it logs `bootstrap: catalog already ingested, skipping.` and exits immediately —
     this is why `pnpm dev` can run it on every boot without slowing anything down.
   - **If no** (first run, or after wiping `data/`), it runs the full ingest chain: parses
     `tools/catalog/curated.yaml`, loads the exercise catalog + strength standards into the db,
     generates the German exercise-name i18n file, and pulls in exercise photos and muscle-map
     assets.

The very first `pnpm dev` you run will take noticeably longer (it's doing a real ingest, including
some network fetches for images). Every run after that is fast, because the guard above
short-circuits it.

You generally never need to run `pnpm bootstrap` by hand — `pnpm dev` already does it. You would
run the underlying ingest steps manually if you're actively editing the exercise catalog itself;
see [adding-an-exercise.md](./adding-an-exercise.md).

## SQLite database & migrations

- **Location**: `data/liftr.db` at the repo root by default (`LIFTR_DB_PATH` env var overrides
  this — see `packages/server/src/env.ts` and `packages/ingest/src/bootstrap.ts`/`index.ts` for
  where it's read). Images live alongside it under `data/images/` (`LIFTR_IMAGES_DIR`).
- **Schema source of truth**: [`packages/db/src/schema.ts`](../../packages/db/src/schema.ts)
  (Drizzle ORM). Migration files live in `packages/db/drizzle/`.
- **`pnpm db:migrate`** (`packages/db` → `tsx src/migrate.ts`) — applies any pending migrations to
  the db at `LIFTR_DB_PATH` (or the same `../../data/liftr.db` default). You rarely need this by
  hand in dev: migrations already run automatically on server boot (wired into `buildApp()`) and
  again at the start of `pnpm bootstrap`/`pnpm dev`. It's useful if you want to migrate a db
  without also starting the server, e.g. before running `pnpm db:generate` again or when scripting
  something against the db directly.
- **`pnpm db:generate`** (`packages/db` → `drizzle-kit generate`) — you need this only when you've
  **changed `schema.ts` yourself**. It diffs the schema against the existing migrations and writes
  a new SQL migration file into `packages/db/drizzle/`. Review the generated SQL before committing
  it, then run `pnpm db:migrate` (or just restart the server/`pnpm dev`) to apply it.

If you ever want a truly clean slate, delete `data/` and re-run `pnpm dev` — bootstrap will detect
the empty `exercises` table and re-seed everything from scratch (see the bootstrap section above).

## Tests

Not part of getting the app running, but worth knowing up front: `pnpm test` runs the full suite.
See [writing-tests.md](./writing-tests.md) and `tests/README.md` if you're adding tests.
