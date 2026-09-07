import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "~client/lib/api";
import { getRanks, type RankRow } from "~client/services/rankService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRanks", () => {
  it("GETs /api/ranks and returns the response verbatim", async () => {
    const ranks: RankRow[] = [
      {
        exerciseId: "ex-1",
        slug: "bench-press",
        name: null,
        isBodyweight: false,
        tier: "gold",
        division: 2,
        lp: 45,
        e1rm: 100,
        trust: "real",
        nextTargetWeightKg: 102.5,
        nextTargetReps: null,
        peakTier: "platinum",
        peakDivision: 1,
      },
    ];
    mockGet.mockResolvedValue(ranks);

    const result = await getRanks();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/ranks");
    expect(result).toBe(ranks);
  });

  it("passes through rows with a null peak snapshot unchanged", async () => {
    const ranks: RankRow[] = [
      {
        exerciseId: "ex-2",
        slug: "squat",
        name: "Squat",
        isBodyweight: false,
        tier: "silver",
        division: 3,
        lp: 10,
        e1rm: 80,
        trust: "synthetic",
        nextTargetWeightKg: null,
        nextTargetReps: 8,
        peakTier: null,
        peakDivision: null,
      },
    ];
    mockGet.mockResolvedValue(ranks);

    const result = await getRanks();

    expect(result).toEqual(ranks);
  });
});
