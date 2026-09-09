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
import {
  getRunOverallRank,
  getRunPrs,
  getRunRanks,
  type RunOverallRankResponse,
  type RunPrListItem,
  type RunRankRow,
} from "~client/services/runRankService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRunRanks", () => {
  it("GETs /api/runs/ranks and returns the response verbatim", async () => {
    const ranks: RunRankRow[] = [
      {
        category: "5k",
        tier: "gold",
        division: 2,
        lp: 45,
        bestSpeedMps: 3.5,
        trust: "real",
        nextTargetSpeedMps: 3.7,
        peakTier: "platinum",
        peakDivision: 1,
      },
    ];
    mockGet.mockResolvedValue(ranks);

    const result = await getRunRanks();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/runs/ranks");
    expect(result).toBe(ranks);
  });

  it("passes through rows with null trust/bestSpeedMps/peak snapshot unchanged", async () => {
    const ranks: RunRankRow[] = [
      {
        category: "marathon",
        tier: "bronze",
        division: 4,
        lp: 5,
        bestSpeedMps: null,
        trust: null,
        nextTargetSpeedMps: null,
        peakTier: null,
        peakDivision: null,
      },
    ];
    mockGet.mockResolvedValue(ranks);

    const result = await getRunRanks();

    expect(result).toEqual(ranks);
  });
});

describe("getRunPrs", () => {
  it("GETs /api/runs/prs and returns the response verbatim", async () => {
    const prs: RunPrListItem[] = [
      {
        id: "run-pr-1",
        category: "10k",
        kind: "time",
        value: 2400,
        runId: "run-1",
        achievedAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    mockGet.mockResolvedValue(prs);

    const result = await getRunPrs();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/runs/prs");
    expect(result).toBe(prs);
  });
});

describe("getRunOverallRank", () => {
  it("GETs /api/runs/overall-rank and returns the response verbatim", async () => {
    const response: RunOverallRankResponse = {
      current: { tier: "gold", division: 2, lp: 45 },
      peak: { tier: "platinum", division: 1, lp: 90 },
    };
    mockGet.mockResolvedValue(response);

    const result = await getRunOverallRank();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/runs/overall-rank");
    expect(result).toBe(response);
  });

  it("passes through null current/peak bands unchanged", async () => {
    const response: RunOverallRankResponse = { current: null, peak: null };
    mockGet.mockResolvedValue(response);

    const result = await getRunOverallRank();

    expect(result).toEqual({ current: null, peak: null });
  });
});
