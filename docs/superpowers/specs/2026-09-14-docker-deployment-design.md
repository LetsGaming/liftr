# Docker deployment, APK release fix, and native-gating cleanup

**Status:** approved design, not yet implemented (2026-09-14)

## Overview

Liftr has no containerized deployment story today — `pnpm dev` (or `dev-up.mjs` for isolated
agent sessions) is the only documented way to run it, and the native Android APK is built by
`.github/workflows/release.yml` on tag push. This spec adds:

1. A single-container Docker image + `docker-compose.yml` running the Fastify backend, which
   already serves the built client PWA as a static origin (`LIFTR_CLIENT_DIST`) — no separate web
   container.
2. A fix to `release.yml`, which currently builds the release APK without ever setting
   `VITE_API_BASE`, so today's signed release APK has no backend URL baked in and cannot reach any
   API on-device. Plus a local script for building a debug/test APK against a given backend URL
   without cutting a GitHub release.
3. A small cleanup of native-vs-web feature gating, based on a full audit (see below) that found
   every native-only feature already correctly gated except two minor issues.

Out of scope, per explicit decision: TLS/reverse proxy (the existing `LIFTR_ALLOWED_ORIGINS` docs
already assume "the homelab reverse proxy" sits in front of this; Docker just publishes a plain
HTTP port), and the existing local release-signing process itself
(`docs/operations/android-release-signing.md`), which is unchanged — this only adds
`VITE_API_BASE` wiring on top of it.

## A load-bearing discovery: this repo has no working "compiled" runtime path — and the real fix

Before finalizing the Dockerfile, I verified (by actually building and running it) whether
`packages/server`'s existing `"build"`/`"start"` scripts (`tsc -p tsconfig.json` → `node
dist/index.js`) produce a working production server. **They do not.** Every package's
`package.json` (`@liftr/db`, `@liftr/shared`, `@liftr/server`, `@liftr/ingest`) declares `"main":
"./src/index.ts"` — literal TypeScript source, not `dist/`. `tsconfig.base.json`'s `paths` mapping
lets `tsc`/`vue-tsc` *type-check* across packages via source, but it doesn't rewrite emitted
`import "@liftr/db"` specifiers to point at compiled output. So a compiled `packages/server/dist/`
still imports `@liftr/db` through the normal workspace `node_modules` symlink, which resolves to
`packages/db/src/index.ts` — and plain Node's ESM loader refuses to load a `.ts` file. Reproduced
exactly:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../packages/db/src/schema.js'
imported from '.../packages/db/src/index.ts'
```

Nothing in CI or `release.yml` ever exercises this path today — CI only runs `tsc --noEmit`
(type-check, no emit-and-run) and `release.yml` only builds the *client* (a real Vite bundle,
unaffected by this since it doesn't do cross-package runtime resolution). `pnpm dev` and
`dev-up.mjs` both run the server via `tsx watch src/index.ts`, which transpiles TypeScript
on-the-fly for every file it touches, including workspace packages pulled in through
`node_modules` — that's the only execution path that has ever actually worked in this repo.

**This gets fixed at the source, not worked around in Docker.** I tried two approaches and
verified both empirically before settling on one:

- **Rejected: bundle the server with esbuild** into one self-contained file, inlining
  `@liftr/db`/`@liftr/shared` source directly. This actually builds, but fails at runtime:
  `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'better-sqlite3'`. Once `@liftr/db`'s source
  is inlined into `packages/server`'s output file, `better-sqlite3` (a native addon and a
  dependency of `@liftr/db`, not of `@liftr/server`) is no longer reachable — pnpm's per-package
  `node_modules` symlinks only resolve correctly when each package's code still physically lives
  inside that package's own directory. Bundling across a pnpm workspace boundary fights the
  package manager's resolution model; not worth it here.
- **Adopted: give `@liftr/db`/`@liftr/shared` a real, independently-built `dist/`, and make
  consumers resolve to it in production while still resolving to live source in dev.** This is the
  standard "conditional exports" pattern for exactly this dual-mode problem, and both halves are
  verified working in this repo: `tsx` genuinely supports `--conditions <name>` (confirmed via
  `tsx --help`, forwarded straight to Node's own `--conditions` flag), and Node/`tsc`
  (`moduleResolution: NodeNext`) already respect custom `exports` conditions as standard behavior.
  The other missing piece is that `packages/server`'s and `packages/ingest`'s tsconfig doesn't pin
  `rootDir`, so compiling them today — while still resolving `@liftr/db`/`@liftr/shared` via
  `tsconfig.base.json`'s `paths` straight to raw source — pulls foreign source into the local
  compilation and produces nested, unusable output (verified: a real build nested `@liftr/db`'s
  compiled files under `packages/server/dist/db/src/...`). The fix is to stop using `paths`
  (source-jumping) for the actual **build**, and let `server`/`ingest` resolve siblings the same
  way any real consumer would: through `node_modules` → the sibling's own `package.json`
  `exports`.

### 0. Fix the monorepo build so `dist/` actually runs (new prerequisite work)

- **`packages/db/package.json`, `packages/shared/package.json`** — add an `exports` map:
  ```json
  "exports": {
    ".": { "development": "./src/index.ts", "types": "./dist/index.d.ts", "default": "./dist/index.js" },
    "./*": { "development": "./src/*.ts", "types": "./dist/*.d.ts", "default": "./dist/*.js" }
  }
  ```
  Keep the existing top-level `"main"/"types"` pointed at `./dist/index.js`/`./dist/index.d.ts` as
  a fallback for anything that doesn't understand `exports` conditions. No change to these two
  packages' own `tsconfig.json`/`build` script — they're leaf packages (no `@liftr/*` deps of
  their own) and already emit clean, flat `dist/` output (`rootDir: "src"` was already set).
- **New `packages/server/tsconfig.build.json`, `packages/ingest/tsconfig.build.json`** — extend
  `tsconfig.base.json` but reset `"paths": {}` (cancels the inherited source-jumping map for this
  build only) and pin `"rootDir": "src"`. This is a *new, additional* config used only by the
  `build` script; the existing `tsconfig.json` (used by `typecheck`) is untouched, so
  `pnpm typecheck` keeps checking straight against live cross-package source exactly as it does
  today — zero behavior change there.
- **`packages/server/package.json`, `packages/ingest/package.json`**:
  - `"build": "tsc -p tsconfig.build.json"` (was the plain, foreign-source-polluted `tsconfig.json`).
  - `"dev": "tsx --conditions=development watch src/index.ts"` (server) /
    `"start": "tsx --conditions=development src/index.ts"`,
    `"bootstrap": "tsx --conditions=development src/bootstrap.ts"` (ingest) — the `--conditions`
    flag is the only change; behavior is otherwise identical to today's dev loop (live source,
    instant reload on edits to `db`/`shared` too).
  - `"start": "node dist/index.js"` (server) now genuinely works once `build` has run.
- **`scripts/dev-up.mjs`** — its two direct `tsx` spawns (the backend `watch` process and the
  `seed-mock-data.ts` invocation) bypass `package.json`'s `"dev"` string, so both need
  `--conditions=development` added to their `spawn(...)` args directly.
- **`vitest.config.ts`** — add `resolve: { conditions: ["development"] }`, so `pnpm test` keeps
  resolving `@liftr/db`/`@liftr/shared` against live source without requiring a build step first
  (matches today's behavior; without this, tests would need `dist/` pre-built).
- **`packages/client/vite.config.ts`** — add `resolve.conditions: ["development"]`, gated to the
  dev server only (`command === "serve"`). `vite build` (used for the Docker image, the APK, and
  `release.yml`) then resolves `@liftr/shared` via `default` → its built `dist/`, so `@liftr/shared`
  must be built before any client build — already naturally satisfied by `pnpm -r build`'s
  topological ordering; `release.yml` and `scripts/build-apk.mjs` need an explicit
  `pnpm --filter @liftr/shared build` step added before their client build step, since neither
  currently builds anything but the client itself.
- **New CI step** (`.github/workflows/ci.yml`): add `pnpm build` (root) after typecheck/lint/test,
  plus a smoke check that actually boots the compiled server and hits `/api/health` — this exact
  class of bug (a `start` script that's silently never run by anything) is precisely what a real
  "does the production build actually start" check catches. This directly prevents the
  regression this spec just found from recurring.

**Net effect:** the Docker image (below) runs genuinely compiled JS via plain `node`, with a real
`--prod`-only `node_modules` — no `tsx`, no TypeScript source, no dev tooling shipped. This also
fixes `packages/server`'s `"start"` script repo-wide, not just inside Docker.

## 1. Docker image

**New file: `Dockerfile`** (repo root), multi-stage:

- **`deps`** — `node:22-slim` (matches CI's Node 22; `better-sqlite3` needs a Debian-based glibc
  image, not `alpine`/musl, to avoid native-binding rebuild issues). Copy every
  `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`, `corepack enable`, `pnpm install
  --frozen-lockfile` (full install, including devDependencies — needed to run every package's
  `build` script in the next stage).
- **`build`** — from `deps`, copy the full source tree, run (in dependency order — `db`/`shared`
  first, matching pnpm's topological default) `pnpm --filter @liftr/db build`,
  `pnpm --filter @liftr/shared build`, `pnpm --filter @liftr/server build`,
  `pnpm --filter @liftr/ingest build` (each now producing genuinely runnable `dist/`, per §0
  above), then `pnpm --filter @liftr/client build` (needs `@liftr/shared`'s `dist/` already built,
  per §0's `vite.config.ts` change).
- **`runtime`** — fresh `node:22-slim`, `corepack enable`,
  `pnpm install --prod --frozen-lockfile` (genuinely prod-only now — nothing in the runtime image
  needs `tsx`/`typescript`/devDependencies anymore). `better-sqlite3` needs a native binding here;
  it ships prebuilt binaries for common platforms (linux-x64 included) via `prebuildify`, so this
  should resolve without a compiler — **verify this empirically during implementation**, and only
  fall back to installing `python3`/`make`/`g++` in this stage if the prebuilt binary turns out not
  to match the target platform/Node ABI.  Copy in from the `build` stage: each
  package's `dist/` (`server`, `db`, `ingest`, `shared`) and `package.json`,
  `packages/db/drizzle` (migration SQL — `runMigrations` resolves this path relative to its own
  compiled file location, so it must sit exactly one level above wherever `db`'s `dist/` lands),
  `tools/catalog/curated.yaml` (ingest's catalog source), and the built client assets
  (`packages/client/dist` → `/app/packages/client/dist`).
  - `WORKDIR /app`.
  - Env: `LIFTR_DB_PATH=/data/liftr.db`, `LIFTR_IMAGES_DIR=/data/images`,
    `LIFTR_CLIENT_DIST=/app/packages/client/dist` — all absolute, sidestepping the
    `process.cwd()`-relative resolution `env.ts` otherwise does (see
    `docs/reference/environment-variables.md`).
  - `CMD`: a small `docker/entrypoint.sh` that runs the ingest bootstrap once
    (`node packages/ingest/dist/bootstrap.js` — safe to invoke on every container start; it's
    guarded on the `exercises` table being non-empty, exactly the same idempotency
    `dev-up.mjs`/`pnpm dev` already rely on), then execs the server
    (`node packages/server/dist/index.js`).
  - `EXPOSE 3001` (the default `PORT`; overridable via env like everywhere else).
  - `HEALTHCHECK` hitting `GET /api/health` (already exists, returns `{ ok: true }`).

**New file: `.dockerignore`** — `node_modules`, `**/dist`, `**/android`, `data/`, `logs/`,
`.git`, `.superpowers/`, `audit/`, `examples/`.

## 2. `docker-compose.yml`

**New file** (repo root), one service (`liftr`):

- `build: .`
- `env_file: .env` (new `.env.example` documents `LIFTR_TOKEN` — **required**, the server refuses
  to start without it once `NODE_ENV=production` is set, see `env.ts`'s production guard —
  `LIFTR_ALLOWED_ORIGINS`, and optionally `LIFTR_ORS_API_KEY`/`LIFTR_ORS_BASE_URL`).
- `environment: NODE_ENV=production` (needed to trip the `LIFTR_TOKEN`-required guard; not set
  by anything else in the image).
- `volumes: liftr-data:/data` (a named volume — holds the SQLite DB and the mirrored catalog
  images; this is the one thing worth backing up).
- `ports: ["3001:3001"]` (or `${PORT:-3001}:3001`), published for an external reverse proxy to
  target — no TLS here, per the out-of-scope decision above.
- A `healthcheck` block mirroring the Dockerfile's.

## 3. `docs/operations/docker-deployment.md`

**New file**, mirroring the existing `android-release-signing.md` style: what `.env` values to
set and why, first-run behavior (catalog ingest happens automatically and only once, watch the
logs for `bootstrap: ...` lines), how to back up (`docker compose down` + copy the named volume,
or `docker run --rm -v liftr-data:/data -v $PWD:/backup alpine tar czf /backup/liftr-data.tgz
/data`), and how to update (`git pull && docker compose up -d --build`).

## 4. APK release pipeline fix

**Edit `.github/workflows/release.yml`**: add a repository **variable** (not secret — it's a
public-ish URL, not sensitive) `LIFTR_BACKEND_URL`, and pass it to the existing "Build client web
assets" step:

```yaml
- name: Build shared package (client build needs its dist, per §0)
  run: pnpm --filter @liftr/shared build

- name: Build client web assets
  env:
    VITE_API_BASE: ${{ vars.LIFTR_BACKEND_URL }}
  run: pnpm --filter @liftr/client build
```

If the variable isn't set, this is a no-op (empty string, same broken behavior as today) rather
than a hard failure — consistent with how the workflow already treats an unset signing keystore
(warn, don't fail). Document the new variable in `docs/operations/android-release-signing.md`
(rename its scope slightly, or add a short new section — it's the natural home since it's the
other "one-time GitHub repo setup for a working release APK" step).

## 5. Local APK build script

**New file: `scripts/build-apk.mjs`**, styled after `dev-up.mjs`/`dev-down.mjs`'s conventions
(same `parseArgs` helper, same logging prefix style):

```
node scripts/build-apk.mjs --backend-url http://192.168.1.50:3001 [--release]
```

- Builds `@liftr/shared` first (`pnpm --filter @liftr/shared build` — the client build needs its
  `dist/`, per §0), then the client with `VITE_API_BASE` set to `--backend-url`
  (`pnpm --filter @liftr/client build`, with `VITE_API_BASE` in the child's env).
- Runs `npx cap sync android` (`packages/client`).
- Default: `./gradlew assembleDebug` — no signing needed, installs fine for personal
  side-loading/testing (`adb install`).
- `--release`: `./gradlew assembleRelease`, reusing whatever local `keystore.properties`
  `docs/operations/android-release-signing.md` §3 already documents — this script doesn't
  duplicate that signing setup, it just triggers the same Gradle task once it's present.
- Prints the resulting APK path at the end (mirrors `dev-up.mjs`'s final summary block).

## 6. Native-vs-web gating cleanup

From the audit: every native-only feature (Health Connect import, local-notification fallback,
haptics, app-resume/network-reconnect sync triggers) is already correctly gated and degrades
cleanly on web. Two small, in-scope fixes:

- **New file: `packages/client/src/lib/platform.ts`** — a single `isNative()` (wrapping
  `Capacitor.isNativePlatform()`) and `isAndroid()` helper, replacing the 5 ad hoc call sites
  (`health/healthConnect.ts:18`, `lib/haptics.ts:27`, `components/workout/RestTimer.vue:12`,
  `stores/syncStore.ts:114`, `stores/activeWorkoutStore.ts:221`). Pure refactor, no behavior
  change — removes the drift risk the audit flagged (nothing currently enforces these 5 checks
  stay consistent).
- **Edit `packages/client/src/composables/useLiveRun.ts`**: the geolocation start-failure path
  currently gives a generic error regardless of cause. Add a check for
  `!window.isSecureContext` and surface a specific "GPS braucht eine sichere (HTTPS-)Verbindung"
  (or similar German copy, per the project's UI-string convention) message instead of the generic
  one — directly relevant here, since a LAN-only Docker deployment without TLS in front (a
  plausible setup per the out-of-scope decision above) would otherwise hit this with a confusing
  message instead of an actionable one.

## Testing / verification

- `pnpm typecheck && pnpm lint && pnpm test` must stay clean throughout — §0's changes are
  specifically designed to leave `typecheck`'s and `test`'s resolution behavior unchanged (both
  keep resolving `@liftr/db`/`@liftr/shared` via live source, exactly as today), so a regression
  here means §0 was implemented wrong, not that it's expected to require test updates.
- **New, load-bearing check**: `pnpm build` (root) must complete, and the resulting
  `packages/server/dist/index.js` must actually boot and serve `/api/health` under plain `node`
  (no `tsx`, no special flags) — this is the thing that was silently broken and is the actual
  crux of §0. Verify locally before trusting the Dockerfile, and add this as the new CI step
  described in §0.
- `dev-up.mjs`-based manual dev testing (per this repo's own CLAUDE.md workflow) must still work
  unchanged after the `--conditions=development` additions — confirms the dev-loop half of the
  dual-resolution split.
- Manual, Docker: `docker compose up --build`, confirm the `bootstrap: no exercises found —
  running full ingest...` log line appears once, `curl localhost:3001/api/health` returns `{"ok":
  true}`, the web UI loads and can log a set, `docker compose restart` does **not** re-run the
  full ingest (idempotency) and prior data is still present (volume persistence).
- Manual, APK: run `scripts/build-apk.mjs --backend-url <docker host LAN IP>:3001`, install on a
  physical or emulated Android device, confirm it reaches the Dockerized backend (not just that it
  builds).
- `mobile-viewport-check` skill: the `platform.ts`/`useLiveRun.ts` changes don't touch layout or
  markup, so this is likely unnecessary, but worth a quick pass since both touch
  `packages/client/src`.
