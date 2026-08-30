import { describe, expect, it } from "vitest";
import { renderExerciseLines, wrapText, type ExerciseCardEntry } from "./layout.js";

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
