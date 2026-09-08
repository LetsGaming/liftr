#!/usr/bin/env node
/**
 * Run this BEFORE doing any manual/dashboard work in this repo. Starts an isolated backend
 * (Fastify) + dashboard (Vue/Vite) pair — own SQLite file, own log dir, own free ports — with
 * auth open (no LIFTR_TOKEN), migrates that database, ingests the exercise catalog into it, seeds
 * it with realistic mock data (profile, equipment, bodyweight trend, a routine + mesocycle,
 * several weeks of workout history across multiple exercises, a run, a custom exercise), and
 * prints the URLs to use.
 *
 * `--id <name>` (default: "default") namespaces everything — data/agent-<id>/,
 * logs/agent-<id>/ — so multiple agents/sessions working in this same checkout at once never
 * collide on the same database file or port. Always pair with `scripts/dev-down.mjs --id <name>`
 * when done.
 *
 * Exercise catalog images (photos, muscle-diagram SVGs) are the one thing NOT namespaced per
 * session — they're static, network-fetched, content-identical assets, not session data, so they
 * live in the ordinary shared data/images/ dir (the same one plain `pnpm dev` already uses) and
 * are only ever downloaded once, the first time any session needs them.
 *
 * Usage: node scripts/dev-up.mjs [--id <name>]
 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");

function parseArgs(argv) {
  const args = { id: "default" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--id" && argv[i + 1] !== undefined) args.id = argv[++i];
  }
  if (!/^[a-zA-Z0-9_-]+$/.test(args.id)) {
    throw new Error(`--id must be alphanumeric/dash/underscore only, got: ${args.id}`);
  }
  return args;
}

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
  });
  child.unref();
  return child;
}

async function main() {
  const { id } = parseArgs(process.argv.slice(2));
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
  // No accounts/sessions today (see docs/adr/0002) — the server only enforces auth when
  // LIFTR_TOKEN is set, so deleting it (regardless of what the parent shell happens to have)
  // guarantees this session's dashboard never hits AuthGate's token prompt.
  delete env.LIFTR_TOKEN;

  log(`starting backend on :${backendPort} (db: ${dbPath})`);
  const backendLog = path.join(logDir, "backend.out.log");
  // buildApp() runs migrations at module-load time (packages/server/src/db.ts), so the backend
  // is also what brings this fresh SQLite file up to schema — nothing else needs to migrate it.
  const backend = spawnBackground("pnpm", ["exec", "tsx", "watch", "src/index.ts"], {
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

  log("ingesting exercise catalog + seeding mock data (first run on this machine also fetches catalog images — may take a while)...");
  await new Promise((resolve, reject) => {
    const seed = spawn("pnpm", ["exec", "tsx", "scripts/seed-mock-data.ts"], {
      cwd: repoRoot,
      env,
      stdio: "inherit",
    });
    seed.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`seed-mock-data.ts exited with code ${code}`))));
  });

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

  console.log("");
  log("ready.");
  console.log(`  Dashboard:  http://localhost:${vitePort}`);
  console.log(`  Backend:    http://localhost:${backendPort}`);
  console.log(`  Auth:       open (no LIFTR_TOKEN set) — no login screen`);
  console.log(`  Logs:       ${logDir}`);
  console.log(`  When done:  node scripts/dev-down.mjs --id ${id}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
