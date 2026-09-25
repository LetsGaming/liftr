#!/usr/bin/env node
/**
 * Verifies every locale pack has exactly the keys de.yaml (the source of truth) has, with
 * matching {placeholder} names — a mistranslated or missing key shows German at runtime rather
 * than crashing, so nothing else catches this.
 *
 * Usage:
 *   node scripts/i18n-check.mjs          human-readable report, exit 1 on any problem
 *   node scripts/i18n-check.mjs --json   same checks, machine-readable output
 *
 * Checks both locale kinds:
 *   - hand-maintained: packages/client/src/locales/{de,en}.yaml
 *   - generated:       packages/client/src/locales/exercises.{de,en}.json (never hand-edit these
 *                       — see packages/ingest/src/generateI18n.ts)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { diffAgainstSource, flatten } from "./lib/i18nCheck.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const localesDir = `${root}/packages/client/src/locales`;
const json = process.argv.includes("--json");

function loadYaml(name) {
  return parseYaml(readFileSync(`${localesDir}/${name}.yaml`, "utf8"));
}

function loadJson(name) {
  return JSON.parse(readFileSync(`${localesDir}/${name}.json`, "utf8"));
}

const problems = [
  ...diffAgainstSource(flatten(loadYaml("de")), flatten(loadYaml("en")), "en", "hand-maintained"),
  ...diffAgainstSource(
    flatten(loadJson("exercises.de")),
    flatten(loadJson("exercises.en")),
    "en",
    "generated (exercises — re-run `pnpm ingest --catalog` rather than hand-editing)",
  ),
];

if (json) {
  console.log(JSON.stringify(problems, null, 2));
} else if (problems.length === 0) {
  console.log("i18n check passed: en matches de key-for-key, with matching placeholders.");
} else {
  console.error(`i18n check found ${problems.length} problem(s):\n`);
  for (const p of problems) {
    console.error(`  [${p.kind}] ${p.locale}: "${p.key}" — ${p.issue}`);
  }
  console.error("\nSee docs/guides/adding-a-language.md.");
}

process.exit(problems.length === 0 ? 0 : 1);
