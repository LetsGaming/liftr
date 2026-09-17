#!/usr/bin/env node
/**
 * Builds an installable Android APK, without cutting a GitHub release. Useful for testing
 * against a Docker-deployed backend from a real device — the app itself asks for that backend's
 * URL on first launch (see ServerGate.vue/useServerConnection.ts) and verifies it before
 * proceeding, so no backend URL needs to be baked in at build time.
 *
 * Usage: node scripts/build-apk.mjs [--release]
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
  const args = { release: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--release") args.release = true;
  }
  return args;
}

function main() {
  const { release } = parseArgs(process.argv.slice(2));

  log(`building @liftr/shared...`);
  execFileSync("pnpm", ["--filter", "@liftr/shared", "build"], { cwd: repoRoot, stdio: "inherit" });

  log(`building client...`);
  execFileSync("pnpm", ["--filter", "@liftr/client", "build"], { cwd: repoRoot, stdio: "inherit" });

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
