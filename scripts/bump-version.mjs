#!/usr/bin/env node
/**
 * Bump the project version everywhere and (optionally) cut a release.
 *
 * Usage:
 *   node scripts/bump-version.mjs <version|major|minor|patch> [flags]
 *
 * Version argument:
 *   1.2.3              an explicit semver
 *   major|minor|patch  bump that part of the current version
 *
 * Flags:
 *   --dry-run   show what would change; write nothing, tag nothing
 *   --tag       commit the version files (when the bump changed any) and
 *               create an annotated git tag v<version>. Re-running with --tag
 *               once the files are already committed only creates the tag.
 *   --push      push the branch + the tag — release.yml runs on v*.*.* tags,
 *               runs the full CI suite, then builds a signed Android release
 *               APK and attaches it to a new GitHub Release. Implies --tag.
 *   --yes       skip the confirmation prompt
 *
 * Updates: the root package.json and every workspace package's package.json under
 * packages/ (all currently pinned at 0.0.0, all private — this repo doesn't publish
 * to npm, so this is purely a single "project version" marker kept in sync with
 * CHANGELOG.md and the release tag), plus CHANGELOG.md (renames the [Unreleased]
 * section to the new version with today's date and opens a fresh [Unreleased]).
 *
 * pnpm-lock.yaml is deliberately left untouched: unlike npm's package-lock.json, it
 * only ever links local workspace packages as `link:packages/<name>` — it never
 * duplicates their version number — so there's nothing in it to bump.
 *
 * Note: the Android APK's own versionName/versionCode are NOT sourced from
 * package.json — release.yml derives versionName straight from the pushed git tag
 * and versionCode from the CI run number (see its "Derive app version" step). This
 * script's version bump and that tag need to agree (--tag/--push do this for you),
 * but nothing here feeds the Gradle build directly.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import readline from "node:readline";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ── Parse args ────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const [bumpArg] = argv.filter((a) => !a.startsWith("--"));

const dryRun = flags.has("--dry-run");
const doPush = flags.has("--push");
const doTag = flags.has("--tag") || doPush;
const assumeYes = flags.has("--yes");
const keepUnreleasedDetails = flags.has("--keep-unreleased-details");

if (!bumpArg) {
  console.error(
    "Usage: node scripts/bump-version.mjs <version|major|minor|patch> " +
      "[--dry-run] [--tag] [--push] [--yes] [--keep-unreleased-details]",
  );
  process.exit(1);
}

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const writeJson = (p, o) => fs.writeFileSync(p, JSON.stringify(o, null, 2) + "\n");

// ── Resolve the target version ────────────────────────────────────────────
const rootPkgPath = path.join(root, "package.json");
const rootPkg = readJson(rootPkgPath);
const current = rootPkg.version;

function resolveVersion(cur, arg) {
  if (/^\d+\.\d+\.\d+(?:-[\w.]+)?$/.test(arg)) return arg;
  const m = cur.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) throw new Error(`Current version "${cur}" is not semver`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (arg === "major") [maj, min, pat] = [maj + 1, 0, 0];
  else if (arg === "minor") [min, pat] = [min + 1, 0];
  else if (arg === "patch") pat += 1;
  else throw new Error(`Invalid bump "${arg}" — use major|minor|patch or X.Y.Z`);
  return `${maj}.${min}.${pat}`;
}

const version = resolveVersion(current, bumpArg);
const tag = `v${version}`;

// ── Helper: Summarize Unreleased Section ──────────────────────────────────
function summarizeUnreleasedBlock(rawUnreleasedText) {
  const categories = {};
  let currentCategory = "General";

  const lines = rawUnreleasedText.split("\n");
  let currentItemRaw = "";

  const processAndFlushItem = () => {
    if (!currentItemRaw.trim()) return;

    if (!categories[currentCategory]) {
      categories[currentCategory] = [];
    }

    // Normalize whitespace and line breaks.
    const cleanedText = currentItemRaw.replace(/\s+/g, " ").trim();

    // Pull out a leading **Title** and the text that follows it.
    const match = cleanedText.match(/^(\*\*[^*]+\*\*)\s*(.*)$/);

    if (match) {
      const [, title, description] = match;
      if (description) {
        // First sentence only (up to the first . ! or ?).
        const sentenceEndMatch = description.match(/^([^.!?]*[.!?])/);
        const firstSentence = sentenceEndMatch ? sentenceEndMatch[1].trim() : description.trim();
        categories[currentCategory].push(`${title} ${firstSentence}`);
      } else {
        categories[currentCategory].push(title);
      }
    } else {
      // No **Title** — fall back to the entry's first sentence.
      const sentenceEndMatch = cleanedText.match(/^([^.!?]*[.!?])/);
      const firstSentence = sentenceEndMatch ? sentenceEndMatch[1].trim() : cleanedText.trim();
      categories[currentCategory].push(firstSentence);
    }

    currentItemRaw = "";
  };

  for (const line of lines) {
    const categoryHeader = line.match(/^###\s+(.+)$/);
    if (categoryHeader) {
      processAndFlushItem();
      currentCategory = categoryHeader[1].trim();
      continue;
    }

    // A new top-level bullet.
    const bulletMatch = line.match(/^[-*]\s+(.+)$/);
    if (bulletMatch) {
      processAndFlushItem();
      currentItemRaw = bulletMatch[1].trim();
      continue;
    }

    // Skip nested sub-bullets.
    if (/^\s+[-*]\s+/.test(line)) {
      continue;
    }

    // Continuation lines of the current bullet.
    if (currentItemRaw && line.trim().length > 0) {
      currentItemRaw += " " + line.trim();
    }
  }

  processAndFlushItem();

  const outputLines = [];
  for (const [category, items] of Object.entries(categories)) {
    if (items.length === 0) continue;
    outputLines.push(`### ${category}\n`);
    for (const item of items) {
      outputLines.push(`- ${item}`);
    }
    outputLines.push("");
  }

  return outputLines.length > 0
    ? outputLines.join("\n").trim()
    : "- Internal updates and minor improvements.";
}

// ── Discover workspace packages ────────────────────────────────────────────
// pnpm-workspace.yaml only ever declares "packages/*" in this repo — reading that
// pattern from a YAML parser would be one dependency for one fixed glob, so this just
// lists packages/*/package.json directly (see pnpm-workspace.yaml if that ever grows
// a second pattern).
const packagesDir = path.join(root, "packages");
const workspacePkgRelPaths = fs.existsSync(packagesDir)
  ? fs
      .readdirSync(packagesDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => `packages/${d.name}/package.json`)
      .filter((rel) => fs.existsSync(path.join(root, rel)))
  : [];

// ── Collect the edits (compute first, write once) ─────────────────────────
const edits = [];

// package.json — root + each workspace package
for (const rel of ["package.json", ...workspacePkgRelPaths]) {
  const p = path.join(root, rel);
  const json = readJson(p);
  if (json.version === version) continue;
  edits.push({ rel, write: () => writeJson(p, { ...json, version }) });
}

// CHANGELOG.md — summarize [Unreleased] → [version]
const clPath = path.join(root, "CHANGELOG.md");
if (fs.existsSync(clPath)) {
  const cl = fs.readFileSync(clPath, "utf8");
  const today = new Date().toISOString().slice(0, 10);

  if (cl.includes(`## [${version}]`)) {
    // already released in the changelog — leave it
  } else if (cl.includes("## [Unreleased]")) {
    const unreleasedHeader = "## [Unreleased]";
    const unreleasedIndex = cl.indexOf(unreleasedHeader);
    const afterUnreleased = unreleasedIndex + unreleasedHeader.length;

    const nextHeaderMatch = cl.slice(afterUnreleased).match(/\n##\s+\[/);
    const nextHeaderIndex = nextHeaderMatch
      ? afterUnreleased + nextHeaderMatch.index
      : -1;

    const unreleasedBody =
      nextHeaderIndex !== -1 ? cl.slice(afterUnreleased, nextHeaderIndex) : cl.slice(afterUnreleased);
    const remainder = nextHeaderIndex !== -1 ? cl.slice(nextHeaderIndex) : "";

    const versionContent = keepUnreleasedDetails
      ? unreleasedBody.trim()
      : summarizeUnreleasedBlock(unreleasedBody);

    // "- " (hyphen), matching this file's existing "## [1.0.0] - 2026-09-16" entry.
    const updatedChangelog =
      cl.slice(0, unreleasedIndex) +
      `## [Unreleased]\n\n## [${version}] - ${today}\n\n${versionContent}\n` +
      remainder;

    edits.push({ rel: "CHANGELOG.md", write: () => fs.writeFileSync(clPath, updatedChangelog) });
  } else {
    console.warn("! CHANGELOG.md has no [Unreleased] section — skipping it.");
  }
}

// ── Report ────────────────────────────────────────────────────────────────
console.log(`\nBump ${current} → ${version}${dryRun ? "  (dry run)" : ""}\n`);
if (edits.length === 0) {
  console.log("Everything is already at this version.");
} else {
  for (const e of edits) console.log(`  ${dryRun ? "would update" : "update"}  ${e.rel}`);
}
if (doTag) console.log(`  ${dryRun ? "would tag" : "tag"}       ${tag}${doPush ? "  (+ push)" : ""}`);

if (dryRun) process.exit(0);

// ── Confirm ───────────────────────────────────────────────────────────────
async function confirm() {
  if (assumeYes || (edits.length === 0 && !doTag)) return true;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((res) => rl.question("\nProceed? [y/N] ", res));
  rl.close();
  return /^y(es)?$/i.test(answer.trim());
}

const git = (...a) => {
  try {
    return execFileSync("git", a, { cwd: root, stdio: "pipe" }).toString().trim();
  } catch (err) {
    const detail = `${err.stdout ?? ""}${err.stderr ?? ""}`.trim();
    throw new Error(`git ${a.join(" ")} failed:${detail ? `\n${detail}` : ` exit ${err.status}`}`, { cause: err });
  }
};

if (doTag) {
  try {
    if (git("tag", "--list", tag)) {
      console.error(
        `\n! Tag ${tag} already exists — delete it first if you are redoing the release:` +
          `\n    git tag -d ${tag}` +
          `\n    git push origin :refs/tags/${tag}`,
      );
      process.exit(1);
    }

    const dirty = git("status", "--porcelain")
      .split("\n")
      .map((l) => l.slice(3))
      .filter(Boolean)
      .filter((f) => !edits.some((e) => e.rel === f));
    if (dirty.length > 0) {
      console.error(
        "\n! Uncommitted changes other than the version files:\n" +
          dirty.map((f) => `    ${f}`).join("\n") +
          "\n  Commit or stash them first so the release tag is clean.",
      );
      process.exit(1);
    }
  } catch {
    console.error("! Not a git repository (or git unavailable) — cannot --tag.");
    process.exit(1);
  }
}

if (!(await confirm())) {
  console.log("Aborted.");
  process.exit(1);
}

// ── Apply ─────────────────────────────────────────────────────────────────
for (const e of edits) {
  e.write();
  console.log(`  updated ${e.rel}`);
}

if (!doTag) {
  console.log(
    `\nDone. ${edits.length > 0 ? "Commit these, then release with:" : "Release with:"}\n` +
      `  node scripts/bump-version.mjs ${version} --tag --push`,
  );
  process.exit(0);
}

// ── Commit + tag (+ push) ─────────────────────────────────────────────────
if (edits.length > 0) {
  git("add", ...edits.map((e) => e.rel));
  git("commit", "-m", `chore(release): ${tag}`);
  console.log(`\n  committed ${edits.length} version file(s)`);
}
git("tag", "-a", tag, "-m", `Release ${tag}`);
console.log(`  tagged ${tag}`);

if (doPush) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  execFileSync("git", ["push", "origin", branch], { cwd: root, stdio: "inherit" });
  execFileSync("git", ["push", "origin", tag], { cwd: root, stdio: "inherit" });
  console.log(`  pushed ${branch} + ${tag} — release.yml will build the signed release APK.`);
} else {
  console.log(`  push it to trigger the release:  git push origin HEAD ${tag}`);
}
