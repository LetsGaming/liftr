import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { diffAgainstSource, flatten, placeholders } from "../../scripts/lib/i18nCheck.mjs";

const localesDir = fileURLToPath(new URL("../../packages/client/src/locales", import.meta.url));
const loadYaml = (name: string) => parseYaml(readFileSync(`${localesDir}/${name}.yaml`, "utf8"));
const loadJson = (name: string) => JSON.parse(readFileSync(`${localesDir}/${name}.json`, "utf8"));

describe("flatten", () => {
  it("dot-joins nested keys", () => {
    expect(flatten({ workout: { save: "x", nested: { deep: "y" } } })).toEqual({
      "workout.save": "x",
      "workout.nested.deep": "y",
    });
  });
});

describe("placeholders", () => {
  it("extracts {name}-style placeholders", () => {
    expect(placeholders("Übung {current} von {total}")).toEqual(new Set(["current", "total"]));
  });

  it("returns an empty set for a message with none", () => {
    expect(placeholders("Speichern")).toEqual(new Set());
  });
});

describe("diffAgainstSource", () => {
  it("flags a key present in the source but missing in the locale", () => {
    const problems = diffAgainstSource({ a: "x" }, {}, "en", "test");
    expect(problems).toEqual([{ kind: "test", locale: "en", key: "a", issue: "missing" }]);
  });

  it("flags a key present in the locale but not the source", () => {
    const problems = diffAgainstSource({}, { a: "x" }, "en", "test");
    expect(problems).toEqual([{ kind: "test", locale: "en", key: "a", issue: "orphaned" }]);
  });

  it("flags a placeholder mismatch", () => {
    const problems = diffAgainstSource({ a: "{n} Sätze" }, { a: "sets" }, "en", "test");
    expect(problems).toEqual([{ kind: "test", locale: "en", key: "a", issue: "placeholder-mismatch" }]);
  });

  it("passes a matching key/placeholder pair", () => {
    expect(diffAgainstSource({ a: "{n} Sätze" }, { a: "{n} sets" }, "en", "test")).toEqual([]);
  });
});

// This is the actual enforcement gate: run against the real packs so a PR that adds a German
// string without its English counterpart fails CI here, not just when someone remembers to run
// `pnpm i18n:check` by hand.
describe("locale packs (real files)", () => {
  it("en.yaml matches de.yaml key-for-key with matching placeholders", () => {
    const problems = diffAgainstSource(flatten(loadYaml("de")), flatten(loadYaml("en")), "en", "hand-maintained");
    expect(problems).toEqual([]);
  });

  it("exercises.en.json matches exercises.de.json key-for-key with matching placeholders", () => {
    const problems = diffAgainstSource(
      flatten(loadJson("exercises.de")),
      flatten(loadJson("exercises.en")),
      "en",
      "generated",
    );
    expect(problems).toEqual([]);
  });
});
