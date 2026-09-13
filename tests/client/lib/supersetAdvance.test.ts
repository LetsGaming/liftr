import { describe, expect, it } from "vitest";
import { computeAdvanceAfterLog } from "~client/lib/supersetAdvance";

function ex(overrides: Partial<{ supersetGroup: number | null; logged: boolean[]; restBetweenSetsSeconds: number; restAfterExerciseSeconds: number }> = {}) {
  const logged = overrides.logged ?? [false];
  return {
    supersetGroup: overrides.supersetGroup ?? null,
    sets: logged.map((l) => ({ logged: l })),
    restBetweenSetsSeconds: overrides.restBetweenSetsSeconds ?? 90,
    restAfterExerciseSeconds: overrides.restAfterExerciseSeconds ?? 120,
  };
}

describe("computeAdvanceAfterLog", () => {
  it("standalone exercise with more unlogged sets: stays put, rests between sets", () => {
    const exercises = [ex({ logged: [true, false] })];
    expect(computeAdvanceAfterLog(exercises, 0)).toEqual({ nextIndex: 0, restSeconds: 90 });
  });

  it("standalone exercise fully logged: advances to the next exercise with unlogged sets, rests after-exercise", () => {
    const exercises = [ex({ logged: [true] }), ex({ logged: [false] })];
    expect(computeAdvanceAfterLog(exercises, 0)).toEqual({ nextIndex: 1, restSeconds: 120 });
  });

  it("last exercise fully logged with nothing left: stays put (workout complete)", () => {
    const exercises = [ex({ logged: [true] })];
    expect(computeAdvanceAfterLog(exercises, 0)).toEqual({ nextIndex: 0, restSeconds: 120 });
  });

  it("superset: advances round-robin to the next member with an unlogged set, no rest", () => {
    const exercises = [ex({ supersetGroup: 1, logged: [false] }), ex({ supersetGroup: 1, logged: [false] })];
    expect(computeAdvanceAfterLog(exercises, 0)).toEqual({ nextIndex: 1, restSeconds: null });
  });

  it("superset: wrapping back to an earlier member means a round completed, rests between sets", () => {
    const exercises = [ex({ supersetGroup: 1, logged: [false] }), ex({ supersetGroup: 1, logged: [false] })];
    expect(computeAdvanceAfterLog(exercises, 1)).toEqual({ nextIndex: 0, restSeconds: 90 });
  });

  it("superset: whole group finished, advances to the next non-group exercise, rests after-exercise", () => {
    const exercises = [ex({ supersetGroup: 1, logged: [true] }), ex({ supersetGroup: 1, logged: [true] }), ex({ logged: [false] })];
    expect(computeAdvanceAfterLog(exercises, 0)).toEqual({ nextIndex: 2, restSeconds: 120 });
  });

  it("out-of-range index returns unchanged with no rest", () => {
    const exercises = [ex()];
    expect(computeAdvanceAfterLog(exercises, 5)).toEqual({ nextIndex: 5, restSeconds: null });
  });
});
