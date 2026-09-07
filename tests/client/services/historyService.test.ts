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
import { getHistoryPage, type HistoryPage } from "~client/services/historyService";

const mockGet = vi.mocked(api.get);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getHistoryPage", () => {
  it("requests /api/history?limit=20 with no cursor argument", async () => {
    const page: HistoryPage = { items: [], nextCursor: null };
    mockGet.mockResolvedValue(page);

    const result = await getHistoryPage();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/history?limit=20");
    expect(result).toBe(page);
  });

  it("requests /api/history?limit=20 (no cursor param) when cursor is null", async () => {
    mockGet.mockResolvedValue({ items: [], nextCursor: null });

    await getHistoryPage(null);

    expect(mockGet).toHaveBeenCalledWith("/api/history?limit=20");
  });

  it("requests /api/history?limit=20 (no cursor param) when cursor is an empty string", async () => {
    mockGet.mockResolvedValue({ items: [], nextCursor: null });

    await getHistoryPage("");

    expect(mockGet).toHaveBeenCalledWith("/api/history?limit=20");
  });

  it("appends an encoded cursor param when a cursor is given", async () => {
    mockGet.mockResolvedValue({ items: [], nextCursor: null });

    await getHistoryPage("abc123");

    expect(mockGet).toHaveBeenCalledWith("/api/history?limit=20&cursor=abc123");
  });

  it("URL-encodes special characters in the cursor", async () => {
    mockGet.mockResolvedValue({ items: [], nextCursor: null });

    await getHistoryPage("2026-01-01T00:00:00.000Z&weird=value");

    expect(mockGet).toHaveBeenCalledWith(
      "/api/history?limit=20&cursor=" + encodeURIComponent("2026-01-01T00:00:00.000Z&weird=value"),
    );
  });

  it("returns the response verbatim", async () => {
    const page: HistoryPage = {
      items: [{ kind: "workout", id: "w1", at: "2026-01-01T00:00:00.000Z", title: "Leg day", meta: {} }],
      nextCursor: "next-cursor",
    };
    mockGet.mockResolvedValue(page);

    const result = await getHistoryPage("prev-cursor");

    expect(result).toBe(page);
  });
});
