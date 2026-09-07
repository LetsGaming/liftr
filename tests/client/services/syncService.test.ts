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
import { postSyncBatch, type SyncItem } from "~client/services/syncService";

const mockPost = vi.mocked(api.post);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("postSyncBatch", () => {
  it("POSTs the given items wrapped in { items } and unwraps the { results } envelope", async () => {
    const items: SyncItem[] = [
      { clientId: "c1", type: "log_set", payload: { reps: 5 } },
      { clientId: "c2", type: "finish_workout", payload: {} },
    ];
    const results = [
      { clientId: "c1", status: "created" as const, serverId: "s1" },
      { clientId: "c2", status: "already_synced" as const },
    ];
    mockPost.mockResolvedValue({ results });

    const result = await postSyncBatch(items);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/sync", { items });
    expect(result).toBe(results);
  });

  it("passes an empty items array through unchanged (no client-side batching/chunking here — that's syncStore's job)", async () => {
    mockPost.mockResolvedValue({ results: [] });

    const result = await postSyncBatch([]);

    expect(mockPost).toHaveBeenCalledWith("/api/sync", { items: [] });
    expect(result).toEqual([]);
  });
});
