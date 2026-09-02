import { describe, expect, it } from "vitest";
import {
  CARD_DIMENSIONS,
  chooseCardSize,
  distributeFillGap,
  exerciseGridRowCount,
  renderExerciseLines,
  wrapText,
  type ExerciseCardEntry,
} from "./layout.js";

describe("renderExerciseLines", () => {
  it("lists every set uncompressed for a normal-sized workout", () => {
    const exercises: ExerciseCardEntry[] = [
      { name: "Kurzhantelrudern", sets: [{ weightKg: 9, reps: 4, isWarmup: false }, { weightKg: 10, reps: 6, isWarmup: false }] },
    ];
    const lines = renderExerciseLines(exercises);
    expect(lines[0]!.detail).toContain("4×9kg");
    expect(lines[0]!.detail).toContain("6×10kg");
  });

  it("marks warm-up sets", () => {
    const exercises: ExerciseCardEntry[] = [
      { name: "Kniebeuge", sets: [{ weightKg: 40, reps: 5, isWarmup: true }] },
    ];
    expect(renderExerciseLines(exercises)[0]!.detail).toContain("W");
  });

  it("compresses to a range summary once the exercise count exceeds the threshold", () => {
    const exercises: ExerciseCardEntry[] = Array.from({ length: 11 }, (_, i) => ({
      name: `Exercise ${i}`,
      sets: [
        { weightKg: 9, reps: 4, isWarmup: false },
        { weightKg: 12, reps: 4, isWarmup: false },
      ],
    }));
    const lines = renderExerciseLines(exercises);
    expect(lines[0]!.detail).toMatch(/2 × 9-12 kg/);
  });

  it("falls back to a set count for rep-only (bodyweight) exercises when compressed", () => {
    const exercises: ExerciseCardEntry[] = Array.from({ length: 11 }, (_, i) => ({
      name: `Pushups ${i}`,
      sets: [{ weightKg: null, reps: 12, isWarmup: false }],
    }));
    expect(renderExerciseLines(exercises)[0]!.detail).toBe("1 Sätze");
  });
});

describe("wrapText", () => {
  it("wraps long text without breaking words", () => {
    const lines = wrapText("Push Day A vollstaendiges Training heute", 12);
    expect(lines.every((l) => l.length <= 12 || !l.includes(" "))).toBe(true);
    expect(lines.join(" ").replace(/\s+/g, " ")).toBe("Push Day A vollstaendiges Training heute");
  });
});

describe("exerciseGridRowCount", () => {
  it("packs two exercise lines per grid row", () => {
    expect(exerciseGridRowCount(0)).toBe(0);
    expect(exerciseGridRowCount(1)).toBe(1);
    expect(exerciseGridRowCount(2)).toBe(1);
    expect(exerciseGridRowCount(3)).toBe(2);
    expect(exerciseGridRowCount(10)).toBe(5);
  });
});

describe("chooseCardSize", () => {
  const pad = 64;
  it("stays square when content fits within square's height", () => {
    const available = CARD_DIMENSIONS.square.height - pad * 2;
    expect(chooseCardSize(available - 1, pad)).toEqual({ size: "square", overflowsStory: false });
    expect(chooseCardSize(available, pad)).toEqual({ size: "square", overflowsStory: false });
  });

  it("wires up story once content overflows square but still fits 9:16", () => {
    const squareAvailable = CARD_DIMENSIONS.square.height - pad * 2;
    const storyAvailable = CARD_DIMENSIONS.story.height - pad * 2;
    expect(chooseCardSize(squareAvailable + 1, pad)).toEqual({ size: "story", overflowsStory: false });
    expect(chooseCardSize(storyAvailable, pad)).toEqual({ size: "story", overflowsStory: false });
  });

  it("flags overflow even past story so the caller knows to compress rows", () => {
    const storyAvailable = CARD_DIMENSIONS.story.height - pad * 2;
    expect(chooseCardSize(storyAvailable + 1, pad)).toEqual({ size: "story", overflowsStory: true });
  });
});

describe("distributeFillGap", () => {
  it("adds nothing when content already fills or overflows the available height", () => {
    expect(distributeFillGap(1000, 1000, 3)).toBe(0);
    expect(distributeFillGap(1200, 1000, 3)).toBe(0);
  });

  it("splits unused space evenly across the given slots", () => {
    expect(distributeFillGap(700, 1000, 3, 200)).toBeCloseTo(100);
  });

  it("caps per-slot growth so a near-empty card doesn't stretch absurdly", () => {
    expect(distributeFillGap(100, 1000, 3, 56)).toBe(56);
  });

  it("returns 0 when there are no gap slots to distribute into", () => {
    expect(distributeFillGap(100, 1000, 0)).toBe(0);
  });
});
