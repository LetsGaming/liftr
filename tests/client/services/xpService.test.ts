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
import { getXp } from "~client/services/xpService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getXp", () => {
  it("GETs /api/xp and returns the parsed response", async () => {
    const body = {
      totalXp: 1200,
      level: 4,
      xpIntoLevel: 200,
      xpForNextLevel: 500,
      progressPercent: 40,
    };
    mockGet.mockResolvedValue(body);

    const result = await getXp();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/xp");
    expect(result).toBe(body);
  });
});
