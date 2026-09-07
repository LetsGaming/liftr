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
import { getStreak } from "~client/services/streakService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStreak", () => {
  it("GETs /api/streak and returns the parsed status", async () => {
    const body = { streak: 5, tokensRemaining: 2 };
    mockGet.mockResolvedValue(body);

    const result = await getStreak();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/streak");
    expect(result).toBe(body);
  });
});
