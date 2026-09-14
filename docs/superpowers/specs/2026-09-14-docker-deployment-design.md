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

## A load-bearing discovery: this repo has no working "compiled" runtime path

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

**Consequence for this design:** the Docker image runs the server (and the ingest bootstrap) via
`tsx` directly against TypeScript source, exactly like `pnpm dev` does — not via a `tsc` build +
`node dist/index.js`. This means the image keeps the full `node_modules` (root-level `tsx` is a
devDependency, needed at runtime now) rather than a pruned `--prod`-only install; there's no
compiled-dist stage for the server/db/ingest/shared packages at all. Only the **client** gets a
real build step (`vite build` produces genuine static browser assets — no cross-package runtime
resolution problem there). This is a discovered constraint, not a scope change from the approved
design: the container still does exactly what was approved (build once, run migrations + idempotent
catalog bootstrap, serve API + static client from one process) — just via the same interpreter
mechanism the rest of the repo already relies on, instead of a compiled path that turns out to
never have worked.

## 1. Docker image

**New file: `Dockerfile`** (repo root), multi-stage:

- **`deps`** — `node:22-slim` (matches CI's Node 22; `better-sqlite3` needs a Debian-based glibc
  image, not `alpine`/musl, to avoid native-binding rebuild issues). Copy every
  `package.json`/`pnpm-lock.yaml`/`pnpm-workspace.yaml`, `corepack enable`, `pnpm install
  --frozen-lockfile` (full install — `tsx` is required at runtime, so no `--prod`).
- **`build`** — from `deps`, copy the full source tree, run `pnpm --filter @liftr/client build`
  (only the client needs an actual build artifact — the compiled output is what the server serves
  as static files).
- **`runtime`** — from `deps`  (to avoid dragging the client's separate `node_modules`/build cache
  into the final layer, reuse `deps`'s installed `node_modules` directly rather than `build`'s),
  copy in: `packages/server/src`, `packages/db/{src,drizzle}`, `packages/shared/src`,
  `packages/ingest/src`, each package's `package.json`, root `tsconfig.base.json` +
  per-package `tsconfig.json` (tsx doesn't need these to run, but keeping them avoids drift if
  anyone later `docker exec`s in to typecheck), `tools/catalog/curated.yaml` (ingest's catalog
  source), and the **built** client assets from the `build` stage
  (`packages/client/dist` → `/app/packages/client/dist`).
  - `WORKDIR /app`.
  - Env: `LIFTR_DB_PATH=/data/liftr.db`, `LIFTR_IMAGES_DIR=/data/images`,
    `LIFTR_CLIENT_DIST=/app/packages/client/dist` — all absolute, sidestepping the
    `process.cwd()`-relative resolution `env.ts` otherwise does (see
    `docs/reference/environment-variables.md`).
  - `CMD`: a small `docker/entrypoint.sh` that runs the ingest bootstrap once
    (`pnpm --filter @liftr/ingest exec tsx src/bootstrap.ts` — safe to invoke on every container
    start; it's guarded on the `exercises` table being non-empty, exactly the same idempotency
    `dev-up.mjs`/`pnpm dev` already rely on), then execs the server
    (`pnpm --filter @liftr/server exec tsx src/index.ts` — no `watch`, this is a one-shot prod
    process, not a dev loop).
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

- Builds the client with `VITE_API_BASE` set to `--backend-url` (`pnpm --filter @liftr/client
  build`, with `VITE_API_BASE` in the child's env).
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

- `pnpm typecheck && pnpm lint && pnpm test` — unaffected by the Docker/CI files; the
  `platform.ts` refactor and `useLiveRun.ts` change are covered by existing type-checking, and any
  existing tests touching those 5 call sites or `useLiveRun` must still pass.
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
