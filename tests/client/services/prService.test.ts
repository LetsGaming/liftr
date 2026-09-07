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
import { getPrs, type PrListItem } from "~client/services/prService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getPrs", () => {
  it("GETs /api/prs and returns the response verbatim", async () => {
    const prs: PrListItem[] = [
      {
        id: "pr-1",
        exerciseId: "ex-1",
        exerciseSlug: "bench-press",
        exerciseName: null,
        kind: "e1rm",
        value: 100,
        achievedAt: "2026-01-01T00:00:00.000Z",
        workoutId: "w-1",
      },
    ];
    mockGet.mockResolvedValue(prs);

    const result = await getPrs();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/prs");
    expect(result).toBe(prs);
  });
});
