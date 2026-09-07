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
import { getOverallRank, type OverallRankResponse } from "~client/services/overallRankService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOverallRank", () => {
  it("GETs /api/overall-rank and returns the response verbatim", async () => {
    const response: OverallRankResponse = {
      current: { tier: "gold", division: 2, lp: 45 },
      peak: { tier: "platinum", division: 1, lp: 90 },
    };
    mockGet.mockResolvedValue(response);

    const result = await getOverallRank();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/overall-rank");
    expect(result).toBe(response);
  });

  it("passes through null current/peak bands unchanged", async () => {
    const response: OverallRankResponse = { current: null, peak: null };
    mockGet.mockResolvedValue(response);

    const result = await getOverallRank();

    expect(result).toEqual({ current: null, peak: null });
  });
});
