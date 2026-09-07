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
import { getRankEvents, type RankEventsByWeekday } from "~client/services/rankEventsService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getRankEvents", () => {
  it("GETs /api/rank-events and returns the response verbatim", async () => {
    const events: RankEventsByWeekday[] = [
      { weekday: 0, count: 2, flaggedCount: 0 },
      { weekday: 1, count: 0, flaggedCount: 0 },
    ];
    mockGet.mockResolvedValue(events);

    const result = await getRankEvents();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/rank-events");
    expect(result).toBe(events);
  });
});
