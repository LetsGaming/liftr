import { describe, expect, it } from "vitest";
import type { CatalogEntry } from "~ingest/catalogSchema.js";
import { howToTextFor } from "~ingest/generateHowTo.js";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "back-squat",
    wgerId: null,
    freeExerciseDbId: null,
    wgerImageId: null,
    nameDe: "Kniebeuge",
    nameEn: "Back Squat",
    equipment: "barbell",
    requiresEquipment: null,
    movementPattern: "squat",
    primaryMuscles: ["quads"],
    secondaryMuscles: [],
    isBodyweight: false,
    bodyweightLeverage: null,
    anchor: null,
    ratio: null,
    trust: "derived",
    ...overrides,
  };
}

describe("howToTextFor", () => {
  it("uses the movementPattern's template with the primary muscle's German name interpolated", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: ["quads"] }));
    expect(text).toBe("Rücken gerade halten, Knie in Fußrichtung, kontrolliert absenken — spürbar in den vorderen Oberschenkel.");
  });

  it("has a distinct template per known movement pattern", () => {
    const patterns = ["squat", "hinge", "push-horizontal", "push-vertical", "pull-horizontal", "pull-vertical", "carry"] as const;
    const texts = patterns.map((movementPattern) => howToTextFor(entry({ movementPattern, primaryMuscles: ["chest"] })));
    expect(new Set(texts).size).toBe(patterns.length);
    for (const text of texts) {
      expect(text).toContain("die Brust");
    }
  });

  it("falls back to the isolation template for an unrecognized movement pattern", () => {
    const text = howToTextFor(entry({ movementPattern: "isolation-arms", primaryMuscles: ["biceps"] }));
    expect(text).toBe("Bewegung langsam und kontrolliert ausführen, den Bizeps bewusst anspannen — kein Schwung.");
  });

  it("falls back to a generic muscle phrase when primaryMuscles is empty", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: [] }));
    expect(text).toContain("die Zielmuskulatur");
  });

  it("falls back to a generic muscle phrase for a primary muscle slug with no German mapping", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: ["not-a-real-muscle"] }));
    expect(text).toContain("die Zielmuskulatur");
  });

  it("only ever uses the first primary muscle, ignoring the rest", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: ["chest", "quads"] }));
    expect(text).toContain("die Brust");
    expect(text).not.toContain("Oberschenkel");
  });

  it("uses the English template with the primary muscle's English name interpolated", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: ["quads"] }), "en");
    expect(text).toBe("Keep your back straight, knees tracking over toes, lower under control — you'll feel it in the front of your thighs.");
  });

  it("has a distinct English template per known movement pattern", () => {
    const patterns = ["squat", "hinge", "push-horizontal", "push-vertical", "pull-horizontal", "pull-vertical", "carry"] as const;
    const texts = patterns.map((movementPattern) => howToTextFor(entry({ movementPattern, primaryMuscles: ["chest"] }), "en"));
    expect(new Set(texts).size).toBe(patterns.length);
    for (const text of texts) {
      expect(text).toContain("your chest");
    }
  });

  it("falls back to the English isolation template for an unrecognized movement pattern", () => {
    const text = howToTextFor(entry({ movementPattern: "isolation-arms", primaryMuscles: ["biceps"] }), "en");
    expect(text).toBe("Move slowly and under control, keep your biceps braced the whole time — no swinging.");
  });

  it("falls back to a generic English muscle phrase when primaryMuscles is empty", () => {
    const text = howToTextFor(entry({ movementPattern: "squat", primaryMuscles: [] }), "en");
    expect(text).toContain("the target muscle");
  });
});
