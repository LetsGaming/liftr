import { describe, expect, it } from "vitest";
import { aggregateMuscles, MUSCLE_LABEL_DE, MUSCLE_META, MUSCLE_SLUGS } from "~client/lib/muscles";

describe("MUSCLE_META / MUSCLE_SLUGS", () => {
  it("derives MUSCLE_SLUGS from exactly the keys of MUSCLE_META", () => {
    expect(MUSCLE_SLUGS.sort()).toEqual(Object.keys(MUSCLE_META).sort());
  });

  it("gives every muscle slug a German display label", () => {
    for (const slug of MUSCLE_SLUGS) {
      expect(MUSCLE_LABEL_DE[slug], `missing MUSCLE_LABEL_DE entry for "${slug}"`).toBeTypeOf("string");
      expect(MUSCLE_LABEL_DE[slug]!.length).toBeGreaterThan(0);
    }
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
