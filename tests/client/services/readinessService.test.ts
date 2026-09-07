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
import { getReadiness } from "~client/services/readinessService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getReadiness", () => {
  it("GETs /api/readiness and returns the parsed list", async () => {
    const body = [{ slug: "chest", lastTrainedAt: "2026-09-01T00:00:00.000Z", wasPrimary: true }];
    mockGet.mockResolvedValue(body);

    const result = await getReadiness();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/readiness");
    expect(result).toBe(body);
  });
});
