# Docker Deployment, Build-System Fix, APK Release, and Native-Gating Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Liftr a real Docker deployment (backend + web frontend in one container) and a working native-APK release pipeline pointed at it, after fixing the monorepo's actually-broken production build (`node dist/index.js` currently crashes) at the source instead of routing around it — plus a small native-vs-web feature-gating cleanup surfaced by an audit.

**Architecture:** `@liftr/db`/`@liftr/shared` get a conditional `package.json` `exports` map (`development` → live source, `default` → their own built `dist/`), so `tsx --conditions=development` keeps today's instant dev-reload loop while plain `node` in production resolves to real compiled JS. `packages/server`/`packages/ingest` get a `paths`-free build config so their own `dist/` compiles cleanly without inlining sibling packages' source. The Docker image then runs genuinely compiled output via plain `node`, with a real `--prod`-only `node_modules` (single container, server serves the built client PWA as a static origin, same as it already documents doing in production). `release.yml` gets a backend-URL variable wired into its client build (currently missing entirely), plus a local script for ad-hoc APK builds. A small client-side refactor consolidates 5 ad-hoc `Capacitor.isNativePlatform()` checks and sharpens one error message for LAN-only, no-TLS deployments.

**Tech Stack:** pnpm workspace monorepo, TypeScript (`tsc`, `tsx`), Vite/Vitest, Fastify, Docker/docker-compose, GitHub Actions, Vue 3/Capacitor (Android).

**Spec:** `docs/superpowers/specs/2026-09-14-docker-deployment-design.md`

## Global Constraints

- All UI-facing copy is German (CLAUDE.md) — applies to Task 11's new error message.
- `pnpm typecheck && pnpm lint && pnpm test` must stay green after every task; Tasks 1–3 are
  specifically designed to leave `typecheck`'s and `test`'s resolution behavior unchanged (both
  keep resolving `@liftr/db`/`@liftr/shared` via live source) — a regression there means the task
  was implemented wrong.
- Never hand-edit files under `packages/db/drizzle/` (blocked by a `PreToolUse` hook) — no task in
  this plan needs to; `packages/db/drizzle/*.sql` is only ever *copied*, never generated or edited.
- TLS/reverse proxy is explicitly out of scope for the Docker work — the container publishes plain
  HTTP; an external reverse proxy is assumed.
- Base image is `node:22-slim` (matches CI's Node 22; Debian-based, not Alpine/musl, since
  `better-sqlite3`'s native binding targets glibc).
- `LIFTR_TOKEN` is required whenever `NODE_ENV=production` (existing guard in `packages/server/src/env.ts`) — the Docker Compose setup must set both.

---

## Task 1: Conditional `exports` for `@liftr/db` and `@liftr/shared`

**Files:**
- Modify: `packages/db/package.json`
- Modify: `packages/shared/package.json`

**Interfaces:**
- Produces: `@liftr/db` and `@liftr/shared` resolve to their own `./dist/index.js` (+ `./dist/*.js`
  for subpaths) under plain `node`/default conditions, and to live `./src/index.ts` (+
  `./src/*.ts`) under the `development` custom condition (`tsx --conditions=development` or
  `vitest`'s `resolve.conditions`). Later tasks (2, 3) consume this.

- [ ] **Step 1: Edit `packages/db/package.json`**

Add an `"exports"` field (keep the existing top-level `"main"`/`"types"` as a fallback for tools
that ignore `exports`, but repoint them at `dist/` too):

```json
{
  "name": "@liftr/db",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./*": {
      "development": "./src/*.ts",
      "types": "./dist/*.d.ts",
      "default": "./dist/*.js"
    }
  },
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "generate": "drizzle-kit generate",
    "migrate": "tsx src/migrate.ts",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "drizzle-orm": "^0.45.2"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.12",
    "drizzle-kit": "^0.30.1",
    "tsx": "^4.19.2",
    "typescript": "^5.7.2"
  }
}
```

- [ ] **Step 2: Edit `packages/shared/package.json`** the same way

Read the current file first, then apply the identical `"main"`/`"types"`/`"exports"` change (keep
every other field — `scripts`, `dependencies`, etc. — unchanged):

```json
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "development": "./src/index.ts",
      "types": "./dist/index.d.ts",
      "default": "./dist/index.js"
    },
    "./*": {
      "development": "./src/*.ts",
      "types": "./dist/*.d.ts",
      "default": "./dist/*.js"
    }
  },
```

- [ ] **Step 3: Build both packages**

```bash
pnpm --filter @liftr/db build
pnpm --filter @liftr/shared build
```

Expected: both succeed; `packages/db/dist/index.js` and `packages/shared/dist/index.js` exist.

- [ ] **Step 4: Verify the `default` (production) condition resolves to `dist/`**

Run from inside `packages/server` (so the workspace `node_modules/@liftr/db` symlink is visible):

```bash
(cd packages/server && node -e "import('@liftr/db').then(m => console.log('default condition ->', typeof m.createDb)).catch(e => { console.error(e); process.exit(1); })")
```

Expected output: `default condition -> function`

- [ ] **Step 5: Verify the `development` condition resolves to live source**

```bash
(cd packages/server && node_modules/.bin/tsx --conditions=development -e "import('@liftr/db').then(m => console.log('development condition ->', typeof m.createDb))")
```

Expected output: `development condition -> function` (this one runs straight off
`packages/db/src/index.ts`, transpiled on the fly by `tsx` — no build required for this to work).

- [ ] **Step 6: Confirm `pnpm typecheck` is unaffected**

```bash
pnpm --filter @liftr/db typecheck
pnpm --filter @liftr/shared typecheck
```

Expected: PASS, unchanged — these use the existing `tsconfig.json` (`tsc --noEmit`), not touched
by this task.

- [ ] **Step 7: Commit**

```bash
git add packages/db/package.json packages/shared/package.json
git commit -m "build(db,shared): add conditional exports so dist/ actually resolves in production"
```

---

## Task 2: `paths`-free build config for `@liftr/server` and `@liftr/ingest`

**Files:**
- Create: `packages/server/tsconfig.build.json`
- Create: `packages/ingest/tsconfig.build.json`
- Modify: `packages/server/package.json`
- Modify: `packages/ingest/package.json`

**Interfaces:**
- Consumes: Task 1's `@liftr/db`/`@liftr/shared` `dist/` + `exports`.
- Produces: `packages/server/dist/index.js` and `packages/ingest/dist/bootstrap.js`, both
  independently runnable via plain `node` (no `tsx`, no dev tooling). Tasks 4, 5 consume this.

- [ ] **Step 1: Create `packages/server/tsconfig.build.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": false,
    "declarationMap": false,
    "paths": {}
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Create `packages/ingest/tsconfig.build.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "declaration": false,
    "declarationMap": false,
    "paths": {}
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Update `packages/server/package.json` scripts**

Change only the `scripts` block (leave `dependencies`/`devDependencies` untouched):

```json
  "scripts": {
    "dev": "tsx --conditions=development watch src/index.ts",
    "build": "tsc -p tsconfig.build.json",
    "start": "node dist/index.js",
    "recompute": "tsx --conditions=development src/recompute.ts",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 4: Update `packages/ingest/package.json` scripts**

```json
  "scripts": {
    "start": "tsx --conditions=development src/index.ts",
    "bootstrap": "tsx --conditions=development src/bootstrap.ts",
    "build": "tsc -p tsconfig.build.json",
    "typecheck": "tsc --noEmit"
  },
```

- [ ] **Step 5: Build server and ingest, confirm clean flat output**

```bash
pnpm --filter @liftr/server build
pnpm --filter @liftr/ingest build
find packages/server/dist -maxdepth 1
find packages/ingest/dist -maxdepth 1
```

Expected: `packages/server/dist/index.js` and `packages/ingest/dist/bootstrap.js` exist directly
(no nested `dist/server/src/...` or `dist/db/...` — that nesting is exactly the bug this task
fixes).

- [ ] **Step 6: Verify the compiled server actually boots under plain `node`**

```bash
LIFTR_DB_PATH=/tmp/liftr-plan-smoke.db PORT=39177 node packages/server/dist/index.js &
SERVER_PID=$!
sleep 2
curl -sf http://localhost:39177/api/health
kill $SERVER_PID
rm -f /tmp/liftr-plan-smoke.db
```

Expected: `curl` prints `{"ok":true}`. This is the exact command that failed before this task
(see the spec's "load-bearing discovery" section) — if it fails now, do not proceed to Task 3.

- [ ] **Step 7: Verify the compiled ingest bootstrap boots (idempotent no-op is fine here)**

```bash
LIFTR_DB_PATH=/tmp/liftr-plan-smoke.db node packages/ingest/dist/bootstrap.js
rm -f /tmp/liftr-plan-smoke.db
```

Expected: prints `bootstrap: no exercises found — running full ingest...` (a fresh empty DB) and
completes without error — or, if it errors on a missing `curated.yaml`/images path when run from
`packages/ingest/dist/`, note the exact error for Task 5 (the Docker image copies
`tools/catalog/curated.yaml` to the repo-root-relative path this script expects, so this local
check should be run from the repo root, not from inside `packages/ingest`).

- [ ] **Step 8: Confirm `pnpm typecheck` still passes for both packages (their `tsconfig.json`, not touched)**

```bash
pnpm --filter @liftr/server typecheck
pnpm --filter @liftr/ingest typecheck
```

Expected: PASS, unchanged.

- [ ] **Step 9: Commit**

```bash
git add packages/server/tsconfig.build.json packages/ingest/tsconfig.build.json packages/server/package.json packages/ingest/package.json
git commit -m "build(server,ingest): add paths-free build config so dist/ compiles cleanly and runs"
```

---

## Task 3: Keep the dev loop on live source (`dev-up.mjs`, vitest, client Vite dev server)

**Files:**
- Modify: `scripts/dev-up.mjs`
- Modify: `vitest.config.ts`
- Modify: `packages/client/vite.config.ts`

**Interfaces:**
- Consumes: Task 1's `development` export condition.
- Produces: `pnpm dev`/`dev-up.mjs`/`pnpm test`/client `vite dev` all keep resolving
  `@liftr/db`/`@liftr/shared` from live source, with zero behavior change from before this plan.

- [ ] **Step 1: Add `--conditions=development` to `dev-up.mjs`'s two direct `tsx` spawns**

In `scripts/dev-up.mjs`, find the backend spawn (around line 118):

```javascript
  const backend = spawnBackground("pnpm", ["exec", "tsx", "watch", "src/index.ts"], {
```

Change to:

```javascript
  const backend = spawnBackground("pnpm", ["exec", "tsx", "--conditions=development", "watch", "src/index.ts"], {
```

Then find the `seed-mock-data.ts` spawn (around line 142):

```javascript
    const seed = spawn(tsxBin, ["scripts/seed-mock-data.ts"], {
```

Change to:

```javascript
    const seed = spawn(tsxBin, ["--conditions=development", "scripts/seed-mock-data.ts"], {
```

- [ ] **Step 2: Add `resolve.conditions` to `vitest.config.ts`**

In `vitest.config.ts`, inside the `resolve: { ... }` block (alongside the existing `alias` array),
add a sibling `conditions` key:

```javascript
  resolve: {
    conditions: ["development"],
    alias: [
```

(The `alias` array itself is unchanged — just add `conditions` as a new key before it in the same
object.)

- [ ] **Step 3: Add dev-only `resolve.conditions` to `packages/client/vite.config.ts`**

Change the `defineConfig({...})` call to a function form so it can check the Vite command, and add
`resolve.conditions` only for `serve` (dev server), leaving `build` (production, APK, Docker) on
the default condition (→ `@liftr/shared`'s built `dist/`):

```javascript
export default defineConfig(({ command }) => ({
  resolve: command === "serve" ? { conditions: ["development"] } : undefined,
  plugins: [
```

(Every other top-level key — `plugins`, `build`, `server` — stays exactly as it is now, just
nested one level deeper inside the returned object instead of `defineConfig`'s direct argument.
Close the extra `)` this adds at the very end of the file, after the final `});`.)

- [ ] **Step 4: Verify `dev-up.mjs` still works end-to-end**

```bash
node scripts/dev-up.mjs --id plan-task3-check
```

Expected: reaches "ready." and prints working dashboard/backend URLs, same as before this plan —
confirms editing a `db`/`shared` source file would still hot-reload (not tested here, but the
`--conditions=development` flag is what makes that continue to work).

- [ ] **Step 5: Tear down and run the full test suite**

```bash
node scripts/dev-down.mjs --id plan-task3-check
pnpm test
```

Expected: `pnpm test` passes with no changes in pass/fail count from before this task (confirms
`vitest.config.ts`'s new `conditions` line didn't change test resolution behavior).

- [ ] **Step 6: Commit**

```bash
git add scripts/dev-up.mjs vitest.config.ts packages/client/vite.config.ts
git commit -m "build(dev): keep dev/test resolution on live source via the development export condition"
```

---

## Task 4: CI step that actually boots the compiled server

**Files:**
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Consumes: Task 2's working `packages/server/dist/index.js`.
- Produces: a CI check that fails if the production build ever breaks again the way it was broken
  before this plan.

- [ ] **Step 1: Add a `build` + boot-smoke-test step to `ci.yml`**, after the existing `Test` step:

```yaml
      - name: Build
        run: pnpm -r --filter=./packages/* build

      - name: Smoke-test the compiled server actually boots
        env:
          LIFTR_DB_PATH: ${{ runner.temp }}/ci-smoke.db
          PORT: "39999"
        run: |
          node packages/server/dist/index.js &
          SERVER_PID=$!
          for i in $(seq 1 20); do
            if curl -sf http://localhost:39999/api/health >/dev/null; then
              echo "server booted and healthy"
              kill $SERVER_PID
              exit 0
            fi
            sleep 0.5
          done
          echo "::error::compiled server did not become healthy within 10s"
          kill $SERVER_PID 2>/dev/null || true
          exit 1
```

- [ ] **Step 2: Verify locally by running the same commands from the repo root**

```bash
pnpm -r --filter=./packages/* build
LIFTR_DB_PATH=/tmp/liftr-ci-smoke.db PORT=39999 node packages/server/dist/index.js &
SERVER_PID=$!
sleep 2
curl -sf http://localhost:39999/api/health && echo OK
kill $SERVER_PID
rm -f /tmp/liftr-ci-smoke.db
```

Expected: `{"ok":true}OK`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: fail the build if the compiled server doesn't actually boot"
```

---

## Task 5: `Dockerfile`, `.dockerignore`, `docker/entrypoint.sh`

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`
- Create: `docker/entrypoint.sh`

**Interfaces:**
- Consumes: Tasks 1–2 (every package's real `build` script).
- Produces: a `liftr:local` image buildable with `docker build .`, consumed by Task 6's compose file.

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
**/node_modules
**/dist
packages/client/android
packages/client/ios
data/
logs/
.git
.github
.superpowers
.claude
.impeccable
audit/
examples/
tests/
*.md
.env
.env.*
!.env.example
```

- [ ] **Step 2: Create `docker/entrypoint.sh`**

```sh
#!/bin/sh
set -e

echo "[entrypoint] running catalog bootstrap (no-op if already seeded)..."
node packages/ingest/dist/bootstrap.js

echo "[entrypoint] starting server..."
exec node packages/server/dist/index.js
```

- [ ] **Step 3: Create `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1

FROM node:22-slim AS deps
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/client/package.json packages/client/package.json
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm --filter @liftr/db build \
 && pnpm --filter @liftr/shared build \
 && pnpm --filter @liftr/server build \
 && pnpm --filter @liftr/ingest build \
 && pnpm --filter @liftr/client build

FROM node:22-slim AS runtime
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/server/package.json packages/server/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ingest/package.json packages/ingest/package.json
COPY packages/client/package.json packages/client/package.json
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/db/dist packages/db/dist
COPY --from=build /app/packages/db/drizzle packages/db/drizzle
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/ingest/dist packages/ingest/dist
COPY --from=build /app/packages/client/dist packages/client/dist
COPY --from=build /app/tools/catalog/curated.yaml tools/catalog/curated.yaml
COPY docker/entrypoint.sh docker/entrypoint.sh
RUN chmod +x docker/entrypoint.sh

ENV LIFTR_DB_PATH=/data/liftr.db \
    LIFTR_IMAGES_DIR=/data/images \
    LIFTR_CLIENT_DIST=/app/packages/client/dist \
    PORT=3001

EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 3001) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"

ENTRYPOINT ["docker/entrypoint.sh"]
```

Note: `pnpm install --prod` in the `runtime` stage also installs `packages/client`'s production
dependencies (Vue/Ionic/Capacitor), which are never actually required at runtime — the client is
served as pre-built static files. This is a deliberate simplification to avoid a
`--frozen-lockfile` mismatch risk (the lockfile records the full workspace graph); shrinking the
image by excluding client's deps from this install is a valid optional follow-up, not required for
correctness.

- [ ] **Step 4: Build the image**

```bash
docker build -t liftr:local .
```

Expected: builds successfully through all three stages. If `better-sqlite3`'s native binding fails
to install in the `runtime` stage (no prebuilt binary for the target platform), the error will
name missing build tools (`python3`/`make`/`g++`) — if that happens, add
`RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*` before
the `pnpm install --prod` line in the `runtime` stage and rebuild.

- [ ] **Step 5: Smoke-test the built image directly (no compose yet)**

```bash
docker run --rm -e LIFTR_TOKEN=plan-smoke-test -e NODE_ENV=production -p 3001:3001 liftr:local &
sleep 5
curl -sf -H "Authorization: Bearer plan-smoke-test" http://localhost:3001/api/health
docker ps -q --filter ancestor=liftr:local | xargs -r docker stop
```

Expected: `{"ok":true}`.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore docker/entrypoint.sh
git commit -m "feat(deploy): add Docker image for the backend + web frontend"
```

---

## Task 6: `docker-compose.yml` and `.env.example`

**Files:**
- Create: `docker-compose.yml`
- Create: `.env.example`

**Interfaces:**
- Consumes: Task 5's `Dockerfile`.
- Produces: `docker compose up` as the documented way to run Liftr in production (consumed by
  Task 7's docs and by manual verification).

- [ ] **Step 1: Create `.env.example`**

```
# Required — the server refuses to start in production without this. Generate any long random
# string, e.g.: openssl rand -hex 32
LIFTR_TOKEN=

# Optional — comma-separated CORS allow-list. Leave unset to allow any origin (see
# docs/reference/environment-variables.md for why that's low-risk here — auth is a bearer token
# in a header, not a cookie).
# LIFTR_ALLOWED_ORIGINS=https://liftr.example.com

# Optional — enables road-snapped distance/elevation for planned routes via OpenRouteService.
# Leave unset for straight-line distance only (fully supported, not a misconfiguration).
# LIFTR_ORS_API_KEY=
# LIFTR_ORS_BASE_URL=https://api.openrouteservice.org

# Optional — port the container publishes on the host. Not the same as the container-internal
# port, which is fixed at 3001.
# PORT=3001
```

- [ ] **Step 2: Create `docker-compose.yml`**

```yaml
services:
  liftr:
    build: .
    image: liftr:local
    restart: unless-stopped
    env_file: .env
    environment:
      NODE_ENV: production
    ports:
      - "${PORT:-3001}:3001"
    volumes:
      - liftr-data:/data
    healthcheck:
      test: ["CMD", "node", "-e", "fetch('http://localhost:3001/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3

volumes:
  liftr-data:
```

- [ ] **Step 3: Verify end-to-end**

```bash
cp .env.example .env
sed -i 's/^LIFTR_TOKEN=$/LIFTR_TOKEN=plan-verify-token/' .env
docker compose up --build -d
sleep 5
docker compose logs liftr | grep -i bootstrap
curl -sf -H "Authorization: Bearer plan-verify-token" http://localhost:3001/api/health
docker compose restart liftr
sleep 3
docker compose logs liftr | grep -c "bootstrap: no exercises found" # expect 1, not 2 — idempotency
docker compose down
rm .env
```

Expected: the health check succeeds, and the "no exercises found — running full ingest" log line
appears exactly once across both starts (confirms bootstrap idempotency and volume persistence).

- [ ] **Step 4: Commit**

```bash
git add docker-compose.yml .env.example
git commit -m "feat(deploy): add docker-compose.yml for running the Docker image"
```

---

## Task 7: `docs/operations/docker-deployment.md`

**Files:**
- Create: `docs/operations/docker-deployment.md`
- Modify: `docs/README.md` (add the new doc to the operations bullet's file listing, if it lists files explicitly — otherwise skip; check first)

**Interfaces:**
- Consumes: Tasks 5–6.
- Produces: the human-facing deployment guide.

- [ ] **Step 1: Read `docs/operations/android-release-signing.md` in full** (already done during
  spec/plan research — reuse its heading style: `#`/`##`, short imperative steps, copy-pasteable
  commands, a closing "if things go wrong" section).

- [ ] **Step 2: Create `docs/operations/docker-deployment.md`**

```markdown
# Deploying Liftr with Docker

Runs the backend and the built web client (PWA) as one container — the server already serves the
client's built assets as a static origin in production (see `docs/reference/environment-variables.md`'s
`LIFTR_CLIENT_DIST`), so there's no separate web container. This guide assumes you already have
Docker and Docker Compose installed, and — per `docs/reference/environment-variables.md`'s note on
`LIFTR_ALLOWED_ORIGINS` — a reverse proxy of your own in front of this for TLS/domain routing; the
container itself only publishes plain HTTP.

## 1. Configure `.env`

```bash
cp .env.example .env
```

Open `.env` and set `LIFTR_TOKEN` — the server refuses to start in production without it:

```bash
openssl rand -hex 32
```

Paste the output as `LIFTR_TOKEN`'s value. Leave everything else commented out unless you need it
(see the comments in `.env.example` for what each variable does).

## 2. Start it

```bash
docker compose up --build -d
```

First run: watch `docker compose logs -f liftr` for a `bootstrap: no exercises found — running
full ingest...` line — this seeds the exercise catalog into the persistent volume and only ever
runs once (guarded on the catalog table being empty; every later start logs `bootstrap: catalog
already ingested, skipping.` instead and starts in under a second).

Once it's up, `curl http://localhost:3001/api/health` should return `{"ok":true}`, and the web UI
is reachable at `http://localhost:3001/` (or through your reverse proxy, wherever you've pointed
it).

## 3. Back up your data

Everything that matters — the SQLite database and the mirrored exercise-catalog images — lives in
the `liftr-data` named volume. Back it up with:

```bash
docker run --rm -v liftr-data:/data -v "$PWD":/backup alpine tar czf /backup/liftr-data.tgz /data
```

Restore onto a fresh volume the same way, in reverse (`tar xzf` into a mounted `/data`).

## 4. Update

```bash
git pull
docker compose up -d --build
```

The bootstrap step is idempotent, so this is safe to run on every update — it won't re-seed or
re-fetch anything that's already there.

## If the container won't start

Check `docker compose logs liftr` first. The most common cause is `LIFTR_TOKEN` being unset —
the server logs `LIFTR_TOKEN must be set in production — the homelab reverse proxy is not a
substitute.` and exits immediately if so; go back to step 1.
```

- [ ] **Step 3: Check whether `docs/README.md`'s `operations/` bullet lists files by name**

```bash
grep -A3 "operations/" docs/README.md
```

If it just says "running it for real: Android release signing, deployment, backups,
troubleshooting" (a prose description, not a file list), no edit is needed — the new doc is
already covered by that description. If it explicitly names files, add
`docker-deployment.md` to the list, matching the existing style.

- [ ] **Step 4: Commit**

```bash
git add docs/operations/docker-deployment.md
git commit -m "docs(operations): add Docker deployment guide"
```

(If Step 3 required a `docs/README.md` edit, `git add` that file too before committing.)

---

## Task 8: Fix `release.yml`'s missing `VITE_API_BASE`

**Files:**
- Modify: `.github/workflows/release.yml`
- Modify: `docs/operations/android-release-signing.md`

**Interfaces:**
- Consumes: Task 1 (client build needs `@liftr/shared`'s `dist/`).
- Produces: a release APK that actually has a backend URL baked in.

- [ ] **Step 1: Edit `.github/workflows/release.yml`'s "Build client web assets" step**

Find:

```yaml
      - name: Build client web assets
        run: pnpm --filter @liftr/client build
```

Replace with:

```yaml
      - name: Build shared package (client build needs its dist)
        run: pnpm --filter @liftr/shared build

      - name: Build client web assets
        env:
          VITE_API_BASE: ${{ vars.LIFTR_BACKEND_URL }}
        run: pnpm --filter @liftr/client build
```

- [ ] **Step 2: Add a short section to `docs/operations/android-release-signing.md`**

After the existing "## 2. Add it to GitHub Actions" section (the four secrets table) and before
"## 3. (Optional) Build a signed release locally", insert:

```markdown
## 2b. Point the release APK at your backend

`release.yml` also needs to know where your Docker-deployed backend actually lives — without this,
the built APK has no API URL baked in and can't reach anything on-device. Set a repository
**variable** (not a secret — it's just a URL) called `LIFTR_BACKEND_URL`:

```bash
gh variable set LIFTR_BACKEND_URL --body "https://liftr.your-domain.example"
```

(Or via the web UI: **Settings → Secrets and variables → Actions → Variables tab → New repository
variable**.) Point it at whatever address your reverse proxy exposes the Docker deployment on (see
`docs/operations/docker-deployment.md`) — a LAN IP is fine too if you're not exposing it publicly,
as long as it's reachable from wherever you'll actually use the app. If this variable isn't set,
the build still succeeds but produces the same broken (no-backend-URL) APK as before — same
graceful-degradation pattern as the unset-keystore case above.
```

- [ ] **Step 3: Verify the workflow YAML is valid**

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))" && echo "valid YAML"
```

Expected: `valid YAML`.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/release.yml docs/operations/android-release-signing.md
git commit -m "fix(release): wire VITE_API_BASE into the release APK build"
```

---

## Task 9: Local APK build script

**Files:**
- Create: `scripts/build-apk.mjs`

**Interfaces:**
- Consumes: Task 1's `@liftr/shared` build; the existing `docs/operations/android-release-signing.md`
  §3 local `keystore.properties` flow for `--release`.
- Produces: a debug or release APK on demand, without cutting a GitHub release.

- [ ] **Step 1: Create `scripts/build-apk.mjs`**

```javascript
#!/usr/bin/env node
/**
 * Builds an installable Android APK against a given backend URL, without cutting a GitHub
 * release. Useful for testing a Docker-deployed backend from a real device.
 *
 * Usage: node scripts/build-apk.mjs --backend-url http://192.168.1.50:3001 [--release]
 *
 * Default: builds an unsigned debug APK (installs fine for personal side-loading via
 * `adb install`, no keystore needed). --release builds a signed release APK instead, reusing
 * whatever local packages/client/android/keystore.properties docs/operations/
 * android-release-signing.md §3 already documents — this script doesn't set up signing itself.
 */
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const log = (msg) => console.log(`[build-apk] ${msg}`);

function parseArgs(argv) {
  const args = { backendUrl: null, release: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--backend-url" && argv[i + 1] !== undefined) args.backendUrl = argv[++i];
    else if (argv[i] === "--release") args.release = true;
  }
  if (!args.backendUrl) {
    throw new Error("--backend-url is required, e.g. --backend-url http://192.168.1.50:3001");
  }
  return args;
}

function main() {
  const { backendUrl, release } = parseArgs(process.argv.slice(2));

  log(`building @liftr/shared...`);
  execFileSync("pnpm", ["--filter", "@liftr/shared", "build"], { cwd: repoRoot, stdio: "inherit" });

  log(`building client with VITE_API_BASE=${backendUrl}...`);
  execFileSync("pnpm", ["--filter", "@liftr/client", "build"], {
    cwd: repoRoot,
    stdio: "inherit",
    env: { ...process.env, VITE_API_BASE: backendUrl },
  });

  log("syncing web assets into the Android project...");
  execFileSync("npx", ["cap", "sync", "android"], {
    cwd: path.join(repoRoot, "packages", "client"),
    stdio: "inherit",
  });

  const androidDir = path.join(repoRoot, "packages", "client", "android");
  const gradleTask = release ? "assembleRelease" : "assembleDebug";
  log(`running ./gradlew ${gradleTask}...`);
  execFileSync(process.platform === "win32" ? "gradlew.bat" : "./gradlew", [gradleTask], {
    cwd: androidDir,
    stdio: "inherit",
  });

  const outputDir = path.join(androidDir, "app", "build", "outputs", "apk", release ? "release" : "debug");
  const apk = fs.readdirSync(outputDir).find((f) => f.endsWith(".apk"));
  if (!apk) {
    throw new Error(`No APK found under ${outputDir}`);
  }

  console.log("");
  log("done.");
  console.log(`  APK: ${path.join(outputDir, apk)}`);
  console.log(`  Install on a connected device: adb install "${path.join(outputDir, apk)}"`);
}

main();
```

- [ ] **Step 2: Verify it runs end-to-end** (requires an Android SDK/`ANDROID_HOME` set up locally,
  same prerequisite as `docs/operations/android-release-signing.md` §3):

```bash
node scripts/build-apk.mjs --backend-url http://localhost:3001
```

Expected: completes and prints an `app-debug.apk` path under
`packages/client/android/app/build/outputs/apk/debug/`.

- [ ] **Step 3: Commit**

```bash
git add scripts/build-apk.mjs
git commit -m "feat(scripts): add local APK build script for ad-hoc backend testing"
```

---

## Task 10: Consolidate native-platform checks into `packages/client/src/lib/platform.ts`

**Files:**
- Create: `packages/client/src/lib/platform.ts`
- Test: `tests/client/lib/platform.test.ts`
- Modify: `packages/client/src/health/healthConnect.ts`
- Modify: `packages/client/src/lib/haptics.ts`
- Modify: `packages/client/src/components/workout/RestTimer.vue`
- Modify: `packages/client/src/stores/syncStore.ts`
- Modify: `packages/client/src/stores/activeWorkoutStore.ts`

**Interfaces:**
- Produces: `isNative(): boolean` and `isAndroid(): boolean`, exported from
  `packages/client/src/lib/platform.ts`. Every other client file that needs a native-platform
  check imports from here instead of calling `Capacitor.isNativePlatform()`/`Capacitor.getPlatform()`
  directly.

- [ ] **Step 1: Write the failing test — `tests/client/lib/platform.test.ts`**

```typescript
import { describe, expect, it, vi } from "vitest";

const { isNativePlatformMock, getPlatformMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  getPlatformMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock, getPlatform: getPlatformMock },
}));

import { isAndroid, isNative } from "~client/lib/platform";

describe("isNative", () => {
  it("returns true when Capacitor reports a native platform", () => {
    isNativePlatformMock.mockReturnValue(true);
    expect(isNative()).toBe(true);
  });

  it("returns false on web", () => {
    isNativePlatformMock.mockReturnValue(false);
    expect(isNative()).toBe(false);
  });
});

describe("isAndroid", () => {
  it("returns true only when native and the platform is android", () => {
    isNativePlatformMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("android");
    expect(isAndroid()).toBe(true);
  });

  it("returns false when native but not android (e.g. iOS)", () => {
    isNativePlatformMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("ios");
    expect(isAndroid()).toBe(false);
  });

  it("returns false on web even if getPlatform somehow reports android", () => {
    isNativePlatformMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue("android");
    expect(isAndroid()).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm test -- tests/client/lib/platform.test.ts
```

Expected: FAIL — `Cannot find module '~client/lib/platform'` (file doesn't exist yet).

- [ ] **Step 3: Create `packages/client/src/lib/platform.ts`**

```typescript
/**
 * The single source of truth for "is this running inside the native (Capacitor) app shell, not a
 * browser?" — every feature that only works natively (Health Connect, local notifications,
 * haptics, background sync triggers) should check through here instead of calling
 * Capacitor.isNativePlatform()/getPlatform() directly, so there's one place enforcing consistency.
 */
import { Capacitor } from "@capacitor/core";

export function isNative(): boolean {
  return Capacitor.isNativePlatform();
}

/** Narrower than isNative() — Health Connect exists on Android only, not iOS or web. */
export function isAndroid(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
```

- [ ] **Step 4: Run the test again to verify it passes**

```bash
pnpm test -- tests/client/lib/platform.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 5: Update `packages/client/src/health/healthConnect.ts`**

Replace:

```typescript
import { Capacitor } from "@capacitor/core";
import { Health } from "capacitor-health";
import { api } from "../lib/api";

const LAST_CHECK_KEY = "liftr.healthconnect.lastCheck";

/** Only meaningful on Android — Health Connect doesn't exist on iOS/web. */
export function isHealthConnectAvailable(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
```

With:

```typescript
import { Health } from "capacitor-health";
import { api } from "../lib/api";
import { isAndroid } from "../lib/platform";

const LAST_CHECK_KEY = "liftr.healthconnect.lastCheck";

/** Only meaningful on Android — Health Connect doesn't exist on iOS/web. */
export function isHealthConnectAvailable(): boolean {
  return isAndroid();
}
```

- [ ] **Step 6: Update `packages/client/src/lib/haptics.ts`**

Replace the import line:

```typescript
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
```

With:

```typescript
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { isNative } from "./platform";
```

And the `canHaptic()` body:

```typescript
function canHaptic(): boolean {
  return Capacitor.isNativePlatform() && !prefersReducedMotion();
}
```

Becomes:

```typescript
function canHaptic(): boolean {
  return isNative() && !prefersReducedMotion();
}
```

- [ ] **Step 7: Update `packages/client/src/components/workout/RestTimer.vue`**

Replace:

```typescript
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { onBeforeUnmount, ref, watch } from "vue";

async function fireRestOverNotification() {
  if (Capacitor.isNativePlatform()) {
```

With:

```typescript
import { LocalNotifications } from "@capacitor/local-notifications";
import { onBeforeUnmount, ref, watch } from "vue";
import { isNative } from "../../lib/platform";

async function fireRestOverNotification() {
  if (isNative()) {
```

- [ ] **Step 8: Update `packages/client/src/stores/syncStore.ts`**

Remove the `Capacitor` import (line 9: `import { Capacitor } from "@capacitor/core";`) and add,
alongside the other local imports:

```typescript
import { isNative } from "../lib/platform";
```

Then change:

```typescript
      if (Capacitor.isNativePlatform()) {
```

To:

```typescript
      if (isNative()) {
```

- [ ] **Step 9: Update `packages/client/src/stores/activeWorkoutStore.ts`**

Remove the `Capacitor` import (line 6: `import { Capacitor } from "@capacitor/core";`) and add:

```typescript
import { isNative } from "../lib/platform";
```

Then change:

```typescript
      if (Capacitor.isNativePlatform()) {
```

To:

```typescript
      if (isNative()) {
```

- [ ] **Step 10: Run the full client test suite**

```bash
pnpm test -- tests/client
```

Expected: PASS, same pass count as before this task — `tests/client/lib/haptics.test.ts` already
mocks `@capacitor/core` at the module level (`vi.mock("@capacitor/core", ...)`), which intercepts
`platform.ts`'s import of it too (same resolved module id), so no test changes are needed there or
in any other existing test touching these 5 files.

- [ ] **Step 11: Run typecheck and lint**

```bash
pnpm --filter @liftr/client typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add packages/client/src/lib/platform.ts tests/client/lib/platform.test.ts packages/client/src/health/healthConnect.ts packages/client/src/lib/haptics.ts packages/client/src/components/workout/RestTimer.vue packages/client/src/stores/syncStore.ts packages/client/src/stores/activeWorkoutStore.ts
git commit -m "refactor(client): consolidate native-platform checks into lib/platform.ts"
```

---

## Task 11: Sharpen `useLiveRun.ts`'s GPS error for insecure (non-HTTPS) contexts

**Files:**
- Modify: `packages/client/src/composables/useLiveRun.ts`
- Test: `tests/client/composables/useLiveRun.test.ts`

**Interfaces:**
- No new exports; `useLiveRun()`'s existing return shape (`{ status, points, error, distanceM,
  elapsedS, paceSPerKm, start, pause, resume, finish, discard }`) is unchanged.

- [ ] **Step 1: Write the failing test — `tests/client/composables/useLiveRun.test.ts`**

```typescript
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { checkPermissionsMock, requestPermissionsMock, watchPositionMock } = vi.hoisted(() => ({
  checkPermissionsMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
  watchPositionMock: vi.fn(),
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: checkPermissionsMock,
    requestPermissions: requestPermissionsMock,
    watchPosition: watchPositionMock,
    clearWatch: vi.fn(),
  },
}));

import { useLiveRun } from "~client/composables/useLiveRun";

beforeEach(() => {
  checkPermissionsMock.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
  watchPositionMock.mockRejectedValue(new Error("Geolocation unavailable"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLiveRun start() failure copy", () => {
  it("gives an HTTPS-specific message when the page is not a secure context", async () => {
    vi.stubGlobal("isSecureContext", false);
    const live = useLiveRun();
    await live.start();
    expect(live.error.value).toBe("GPS braucht eine sichere (HTTPS-)Verbindung — im Browser nur über HTTPS verfügbar.");
  });

  it("keeps the generic device-check message on a secure context", async () => {
    vi.stubGlobal("isSecureContext", true);
    const live = useLiveRun();
    await live.start();
    expect(live.error.value).toBe("Standort konnte nicht gestartet werden — GPS auf dem Gerät prüfen.");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
pnpm test -- tests/client/composables/useLiveRun.test.ts
```

Expected: the first test FAILs (`error.value` is the generic message, not the HTTPS-specific one)
— the second test already passes today, since that branch is unchanged.

- [ ] **Step 3: Update the `catch` block in `packages/client/src/composables/useLiveRun.ts`'s `start()`**

Replace:

```typescript
    } catch {
      error.value = "Standort konnte nicht gestartet werden — GPS auf dem Gerät prüfen.";
    }
```

With:

```typescript
    } catch {
      error.value = window.isSecureContext
        ? "Standort konnte nicht gestartet werden — GPS auf dem Gerät prüfen."
        : "GPS braucht eine sichere (HTTPS-)Verbindung — im Browser nur über HTTPS verfügbar.";
    }
```

- [ ] **Step 4: Run the test again to verify it passes**

```bash
pnpm test -- tests/client/composables/useLiveRun.test.ts
```

Expected: PASS (both tests).

- [ ] **Step 5: Run typecheck**

```bash
pnpm --filter @liftr/client typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/composables/useLiveRun.ts tests/client/composables/useLiveRun.test.ts
git commit -m "fix(client): explain that live GPS tracking needs HTTPS, not just device GPS"
```

---

## Final verification (after all tasks)

```bash
pnpm typecheck && pnpm lint && pnpm test
pnpm -r --filter=./packages/* build
docker compose up --build -d
curl -sf -H "Authorization: Bearer <your LIFTR_TOKEN>" http://localhost:3001/api/health
docker compose down
```

Then, per CLAUDE.md's mobile-first convention, run the `mobile-viewport-check` skill against the
touched client files (`RestTimer.vue`, though this task's change to it is a pure logic refactor
with no markup/style change, so this is a quick confirmatory pass, not expected to surface
anything).
