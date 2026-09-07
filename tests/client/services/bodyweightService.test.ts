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
import { getBodyweightLogs, logBodyweight, type BodyweightEntry } from "~client/services/bodyweightService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getBodyweightLogs", () => {
  it("GETs /api/bodyweight and returns the response verbatim", async () => {
    const logs: BodyweightEntry[] = [{ id: "1", date: "2026-01-01", weightKg: 82.5 }];
    mockGet.mockResolvedValue(logs);

    const result = await getBodyweightLogs();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/bodyweight");
    expect(result).toBe(logs);
  });
});

describe("logBodyweight", () => {
  it("POSTs date and weightKg to /api/bodyweight and returns the created entry", async () => {
    const created: BodyweightEntry = { id: "2", date: "2026-02-01", weightKg: 81 };
    mockPost.mockResolvedValue(created);

    const result = await logBodyweight("2026-02-01", 81);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/bodyweight", { date: "2026-02-01", weightKg: 81 });
    expect(result).toBe(created);
  });
});
