// @vitest-environment jsdom
//
// muscles.ts now calls i18n.ts's t(), which reads localStorage at module load (needs a DOM) —
// jsdom's navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would
// otherwise default the shared i18n singleton to "en" for the rest of the test process.
import { beforeEach, describe, expect, it } from "vitest";
import { i18n } from "~client/i18n";
import { aggregateMuscles, muscleLabel, MUSCLE_META, MUSCLE_SLUGS } from "~client/lib/muscles";

beforeEach(() => {
  i18n.global.locale.value = "de";
});

describe("MUSCLE_META / MUSCLE_SLUGS", () => {
  it("derives MUSCLE_SLUGS from exactly the keys of MUSCLE_META", () => {
    expect(MUSCLE_SLUGS.sort()).toEqual(Object.keys(MUSCLE_META).sort());
  });

  it("gives every muscle slug a German display label", () => {
    for (const slug of MUSCLE_SLUGS) {
      expect(muscleLabel(slug), `missing label for "${slug}"`).toBeTypeOf("string");
      expect(muscleLabel(slug).length).toBeGreaterThan(0);
    }
  });

  it("falls back to the slug itself for an unrecognized muscle", () => {
    expect(muscleLabel("unobtainium")).toBe("unobtainium");
  });

  it("assigns every muscle a wger id and a front/back side", () => {
    for (const slug of MUSCLE_SLUGS) {
      const meta = MUSCLE_META[slug]!;
      expect(meta.id).toBeGreaterThan(0);
      expect(typeof meta.front).toBe("boolean");
    }
  });
});

describe("aggregateMuscles", () => {
  it("returns empty primary/secondary for no exercises", () => {
    expect(aggregateMuscles([])).toEqual({ primary: [], secondary: [] });
  });

  it("unions primary and secondary muscles across a single exercise's list", () => {
    const result = aggregateMuscles([
      [
        { slug: "chest", role: "primary" },
        { slug: "triceps", role: "secondary" },
      ],
    ]);
    expect(result.primary).toEqual(["chest"]);
    expect(result.secondary).toEqual(["triceps"]);
  });

  it("unions across multiple exercises without duplicating a slug", () => {
    const result = aggregateMuscles([
      [{ slug: "chest", role: "primary" }],
      [{ slug: "chest", role: "primary" }, { slug: "triceps", role: "secondary" }],
    ]);
    expect(result.primary).toEqual(["chest"]);
    expect(result.secondary).toEqual(["triceps"]);
  });

  it("lets primary win when a muscle is primary in one exercise and secondary in another", () => {
    const result = aggregateMuscles([
      [{ slug: "triceps", role: "secondary" }],
      [{ slug: "triceps", role: "primary" }],
    ]);
    expect(result.primary).toEqual(["triceps"]);
    expect(result.secondary).toEqual([]);
  });

  it("keeps distinct secondary muscles that never appear as primary", () => {
    const result = aggregateMuscles([
      [
        { slug: "chest", role: "primary" },
        { slug: "triceps", role: "secondary" },
        { slug: "front-delts", role: "secondary" },
      ],
    ]);
    expect(result.primary).toEqual(["chest"]);
    expect(result.secondary.sort()).toEqual(["front-delts", "triceps"].sort());
  });
});
