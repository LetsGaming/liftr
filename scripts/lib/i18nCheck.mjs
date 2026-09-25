/** Pure key/placeholder diffing logic for scripts/i18n-check.mjs, split out so it's unit-testable
 *  (see tests/scripts/i18nCheck.test.ts) without shelling out to the CLI. */

/** Flattens a nested message tree to dot-paths, e.g. { workout: { save: "x" } } -> { "workout.save": "x" }. */
export function flatten(obj, prefix = "") {
  const out = {};
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      Object.assign(out, flatten(value, path));
    } else {
      out[path] = value;
    }
  }
  return out;
}

/** vue-i18n placeholders look like {name}; a pluralized message ("a | b | c") is checked as one
 *  string, so a placeholder used in only one plural form still counts as present. */
export function placeholders(message) {
  if (typeof message !== "string") return new Set();
  const matches = message.matchAll(/\{(\w+)\}/g);
  return new Set([...matches].map((m) => m[1]));
}

function sameSet(a, b) {
  return a.size === b.size && [...a].every((x) => b.has(x));
}

/** Compares one non-source locale's flat key/message map against the source's. Returns a
 *  {kind, locale, key, issue} entry per problem — "missing", "orphaned", or "placeholder-mismatch". */
export function diffAgainstSource(sourceFlat, localeFlat, localeName, kind) {
  const problems = [];
  for (const key of Object.keys(sourceFlat)) {
    if (!(key in localeFlat)) {
      problems.push({ kind, locale: localeName, key, issue: "missing" });
    } else if (!sameSet(placeholders(sourceFlat[key]), placeholders(localeFlat[key]))) {
      problems.push({ kind, locale: localeName, key, issue: "placeholder-mismatch" });
    }
  }
  for (const key of Object.keys(localeFlat)) {
    if (!(key in sourceFlat)) {
      problems.push({ kind, locale: localeName, key, issue: "orphaned" });
    }
  }
  return problems;
}
