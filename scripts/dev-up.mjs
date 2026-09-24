#!/usr/bin/env node
/**
 * Run this BEFORE doing any manual/dashboard work in this repo. Starts an isolated backend
 * (Fastify) + dashboard (Vue/Vite) pair — own SQLite file, own log dir, own free ports — then
 * migrates that database, ingests the exercise catalog into it, seeds
 * it with realistic mock data (profile, equipment, bodyweight trend, a routine + mesocycle,
 * several weeks of workout history across multiple exercises, a run, a custom exercise), and
 * prints the URLs to use.
 *
 * `--id <name>` (default: "default") namespaces everything — data/agent-<id>/,
 * logs/agent-<id>/ — so multiple agents/sessions working in this same checkout at once never
 * collide on the same database file or port. Always pair with `scripts/dev-down.mjs --id <name>`
 * when done.
 *
 * By default, the printed dashboard URL logs itself in as the seeded owner (see "auto-login"
 * below) — pass `--loggedout` to get a plain URL that lands on the login screen instead, e.g. to
 * manually exercise the login/logout flow itself.
 *
 * Exercise catalog images (photos, muscle-diagram SVGs) are the one thing NOT namespaced per
 * session — they're static, network-fetched, content-identical assets, not session data, so they
 * live in the ordinary shared data/images/ dir (the same one plain `pnpm dev` already uses) and
 * are only ever downloaded once, the first time any session needs them.
 *
 * The other thing not namespaced per session is the *seed cache*: catalog ingest + the full mock-
 * data seed pipeline (scripts/seed-mock-data.ts) are the slow part of this script, and their
 * output is fully determined by code/schema/catalog state, not by which session is running it —
 * see scripts/lib/seedCache.mjs. On a cache hit, this script copies a previously-seeded database
 * straight into this session's own private dbPath instead of re-running the seed pipeline; the
 * cache itself is read-only from a session's perspective, so this never couples one session's
 * database to another's. Pass `--fresh` to bypass the cache (still repopulates it afterward) when
 * you specifically need today-relative mock-data timestamps.
 *
 * Usage: node scripts/dev-up.mjs [--id <name>] [--verbose] [--fresh] [--loggedout]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "./lib/parseArgs.mjs";
import { computeSeedHash, readSeedCache } from "./lib/seedCache.mjs";
import { DEV_OWNER_USERNAME, DEV_OWNER_PASSWORD } from "./lib/devOwner.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
  });
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.status < 500) return true;
    } catch {
      // Not listening yet — keep polling.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

/** Detached + unref'd so the child outlives this script's own process, with its output going straight to a log file instead of a pipe this process would otherwise need to stay alive to drain. */
function spawnBackground(command, args, { cwd, env, logFile }) {
  const fd = fs.openSync(logFile, "a");
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ["ignore", fd, fd],
    detached: true,
    // Windows-only: pnpm resolves to a .CMD shim there, and Node's spawn() no longer
    // auto-resolves PATHEXT-based shims without shell:true (a security hardening change in
    // recent Node releases) — without this every spawn("pnpm", ...) call below fails with
    // "spawn pnpm ENOENT" on Windows, even though `pnpm` is on PATH and works fine from a
    // real shell. No-op on other platforms. Args are never interpolated into a shell string
    // here (spawn still passes them as an argv array), so this doesn't reopen the injection
    // risk that prompted Node's change.
    shell: process.platform === "win32",
  });
  child.unref();
  return child;
}

/** `pnpm exec tsx ...` doesn't resolve here: tsx isn't a root-level devDependency (only
 *  packages/{server,db,ingest} depend on it directly), and `pnpm exec` only looks at the *current*
 *  package's node_modules/.bin — the workspace root has none — so this fails on every platform,
 *  not just Windows, with "Command \"tsx\" not found". Invoking the packages/server copy's bin
 *  shim directly sidesteps that. */
function tsxBinPath() {
  return path.join(repoRoot, "packages", "server", "node_modules", ".bin", process.platform === "win32" ? "tsx.CMD" : "tsx");
}

/** Runs a repoRoot-relative tsx script to completion, inheriting stdio. cwd stays repoRoot since
 *  these scripts' own imports are file-relative, not cwd-relative — only `scriptPath` needs to
 *  resolve against repoRoot, which it already does as a relative path passed straight through (no
 *  shell involved). */
function runTsxScript(scriptPath, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(tsxBinPath(), ["--conditions=development", scriptPath], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
      // Same Windows shim-resolution issue as spawnBackground above — tsx.CMD needs shell:true.
      shell: process.platform === "win32",
    });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${scriptPath} exited with code ${code}`))));
  });
}

async function main() {
  const { id, verbose, fresh, loggedout } = parseArgs(process.argv.slice(2));
  const log = (msg) => console.log(`[dev-up:${id}] ${msg}`);

  const dataDir = path.join(repoRoot, "data", `agent-${id}`);
  const logDir = path.join(repoRoot, "logs", `agent-${id}`);
  const sessionFile = path.join(dataDir, "dev-session.json");
  // Deliberately NOT namespaced — shared across every session, same dir plain `pnpm dev` uses.
  const sharedImagesDir = path.join(repoRoot, "data", "images");

  // Defensive: a previous run under this id may have crashed before dev-down.mjs ran. Start from
  // an actually-clean slate either way. Never touches sharedImagesDir.
  fs.rmSync(dataDir, { recursive: true, force: true });
  fs.rmSync(logDir, { recursive: true, force: true });
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });

  const backendPort = await getFreePort();
  const vitePort = await getFreePort();
  const dbPath = path.join(dataDir, "liftr.db");

  const env = {
    ...process.env,
    PORT: String(backendPort),
    LIFTR_DB_PATH: dbPath,
    LIFTR_IMAGES_DIR: sharedImagesDir,
  };
  // Muted by default (see app.ts) — a dev/seed session otherwise logs a line per request for
  // every asset/API call the dashboard makes, bloating logDir for no real benefit. --verbose
  // restores full request logging when actually debugging server behavior.
  if (verbose) env.LIFTR_LOG_VERBOSE = "1";

  // Computed before the backend ever touches dbPath: on a hit, the cached snapshot is copied in
  // as this session's own private dbPath *before* anything opens it, so the backend's own startup
  // migration (see below) runs against an already-fully-seeded file and is simply a no-op.
  const seedHash = computeSeedHash(repoRoot);
  const cacheHit = !fresh && readSeedCache(repoRoot, seedHash, dbPath);
  if (cacheHit) {
    log(`seed cache hit (${seedHash}) — reusing a previously-seeded database, skipping full reseed.`);
  } else if (fresh) {
    log(`--fresh passed — skipping seed cache, reseeding from scratch.`);
  } else {
    log(`seed cache miss (${seedHash}) — will run the full seed pipeline.`);
  }

  log(`starting backend on :${backendPort} (db: ${dbPath})`);
  const backendLog = path.join(logDir, "backend.out.log");
  // buildApp() runs migrations at module-load time (packages/server/src/db.ts), so the backend
  // is also what brings this fresh SQLite file up to schema — nothing else needs to migrate it.
  const backend = spawnBackground("pnpm", ["exec", "tsx", "watch", "--conditions=development", "src/index.ts"], {
    cwd: path.join(repoRoot, "packages", "server"),
    env,
    logFile: backendLog,
  });

  const backendReady = await waitForHttp(`http://localhost:${backendPort}/api/health`, 20000);
  if (!backendReady) {
    log(`backend did not respond within 20s — check ${backendLog}`);
    process.exit(1);
  }
  log("backend ready");

  if (cacheHit) {
    // The cached database already has everything except exercise/muscle images, which live in the
    // shared images dir rather than in the cached db file — still need to fetch those on a
    // machine that's never seeded before.
    log("ensuring catalog images are present (first run on this machine only)...");
    await runTsxScript("scripts/ensure-images.ts", env);
  } else {
    log("ingesting exercise catalog + seeding mock data (first run on this machine also fetches catalog images — may take a while)...");
    // LIFTR_SEED_CACHE_HASH tells seed-mock-data.ts to publish its result to the seed cache under
    // this hash once seeding succeeds, so the next dev-up.mjs run (any session, this hash) hits
    // the fast path above instead of repeating all of this.
    await runTsxScript("scripts/seed-mock-data.ts", { ...env, LIFTR_SEED_CACHE_HASH: seedHash });
  }

  // The dashboard reads this token off the URL once (main.ts, dev-only) and stores it via the
  // same setToken() AuthGate.vue itself calls, then strips it from the URL — so by default the
  // very first paint is already past the login screen, matching what a human actually wants from
  // a disposable per-session seeded database. --loggedout skips this to deliberately land on the
  // login screen instead (e.g. to exercise the login flow itself).
  let devToken = null;
  if (!loggedout) {
    const res = await fetch(`http://localhost:${backendPort}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: DEV_OWNER_USERNAME, password: DEV_OWNER_PASSWORD }),
    });
    if (res.ok) {
      devToken = (await res.json()).token;
    } else {
      log(`auto-login failed (${res.status}) — printing a plain URL instead; check ${backendLog}`);
    }
  }

  log(`starting dashboard on :${vitePort}`);
  const viteLog = path.join(logDir, "vite.out.log");
  const vite = spawnBackground("pnpm", ["exec", "vite", "--port", String(vitePort), "--strictPort"], {
    cwd: path.join(repoRoot, "packages", "client"),
    env: { ...env, BACKEND_PORT: String(backendPort) },
    logFile: viteLog,
  });

  const viteReady = await waitForHttp(`http://localhost:${vitePort}/`, 20000);
  if (!viteReady) {
    log(`dashboard did not respond within 20s — check ${viteLog}`);
  }

  fs.writeFileSync(
    sessionFile,
    JSON.stringify(
      {
        id,
        backendPort,
        vitePort,
        backendPid: backend.pid,
        vitePid: vite.pid,
        dataDir,
        logDir,
        startedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );

  const dashboardUrl = devToken ? `http://localhost:${vitePort}/?devToken=${devToken}` : `http://localhost:${vitePort}`;

  console.log("");
  log("ready.");
  console.log(`  Dashboard:  ${dashboardUrl}`);
  console.log(`  Backend:    http://localhost:${backendPort}`);
  console.log(`  Auth:       ${DEV_OWNER_USERNAME} / ${DEV_OWNER_PASSWORD}${devToken ? " (already logged in via the dashboard URL above)" : ""}`);
  console.log(`  Logs:       ${logDir}`);
  console.log(`  When done:  node scripts/dev-down.mjs --id ${id}`);
  // Deliberately no process.exit(0) here: both children are already detached + unref'd, so the
  // event loop has nothing left keeping it alive and node exits on its own once this function
  // returns. A forced process.exit() right after spawning detached children tears libuv down
  // before their process handles finish detaching on Windows, which is what was producing
  // `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c` after this
  // script's own "ready." line — letting the loop drain naturally avoids that abrupt teardown.
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
