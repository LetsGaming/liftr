#!/usr/bin/env node
/**
 * Print one version's section body from CHANGELOG.md — used by release.yml to give a GitHub
 * Release the project's own changelog entry as its body, instead of GitHub's generic
 * commit/PR-list auto-generated notes (which ignore CHANGELOG.md entirely).
 *
 * Usage: node scripts/changelog-section.mjs <version>   (e.g. "1.3.5", no leading "v")
 * Exits non-zero with nothing on stdout if that version has no "## [<version>]" section —
 * callers (release.yml) fall back to generate_release_notes in that case.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function extractChangelogSection(changelog, version) {
  const header = `## [${version}]`;
  const headerIndex = changelog.indexOf(header);
  if (headerIndex === -1) return null;

  const bodyStart = changelog.indexOf("\n", headerIndex) + 1;
  const nextHeaderMatch = changelog.slice(bodyStart).match(/\n##\s+\[/);
  const bodyEnd = nextHeaderMatch ? bodyStart + nextHeaderMatch.index + 1 : changelog.length;

  return changelog.slice(bodyStart, bodyEnd).trim();
}

if (process.argv.includes("--self-test")) {
  const fixture = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [1.2.0] - 2026-01-02",
    "",
    "### Added",
    "",
    "- **Thing.** Detail.",
    "",
    "## [1.1.0] - 2026-01-01",
    "",
    "- Older entry.",
    "",
  ].join("\n");

  const assertEqual = (actual, expected, label) => {
    if (actual !== expected) {
      throw new Error(`self-test failed (${label}):\n  expected: ${JSON.stringify(expected)}\n  actual:   ${JSON.stringify(actual)}`);
    }
  };

  assertEqual(extractChangelogSection(fixture, "1.2.0"), "### Added\n\n- **Thing.** Detail.", "middle section");
  assertEqual(extractChangelogSection(fixture, "1.1.0"), "- Older entry.", "last section");
  assertEqual(extractChangelogSection(fixture, "9.9.9"), null, "missing version");
  console.log("changelog-section.mjs self-test passed");
  process.exit(0);
}

const [version] = process.argv.slice(2);
if (!version) {
  console.error("Usage: node scripts/changelog-section.mjs <version>");
  process.exit(1);
}

const changelog = fs.readFileSync(path.join(root, "CHANGELOG.md"), "utf8");
const section = extractChangelogSection(changelog, version);
if (section === null || section.length === 0) {
  console.error(`No non-empty "## [${version}]" section found in CHANGELOG.md`);
  process.exit(1);
}
console.log(section);
