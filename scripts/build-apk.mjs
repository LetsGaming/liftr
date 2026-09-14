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
