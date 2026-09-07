import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
  // runService's importRunFile builds a multipart request directly (JSON-only `api` wrapper
  // can't carry a File), so it imports apiBase/getToken straight from ~client/lib/api too.
  apiBase: vi.fn(() => ""),
  getToken: vi.fn(() => ""),
}));

import { api, apiBase, getToken } from "~client/lib/api";
import { deleteRun, getRunDetail, getRuns, importRunFile, logManualRun } from "~client/services/runService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockDel = vi.mocked(api.del);
const mockApiBase = vi.mocked(apiBase);
const mockGetToken = vi.mocked(getToken);

function fakeResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockApiBase.mockReturnValue("");
  mockGetToken.mockReturnValue("");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getRuns", () => {
  it("GETs /api/runs and returns the parsed list", async () => {
    const body = [
      {
        id: "run1",
        source: "gpx" as const,
        name: null,
        startedAt: "2026-09-01T00:00:00.000Z",
        distanceM: 5000,
        durationS: 1800,
        avgPaceSPerKm: 360,
        avgHr: null,
        elevationGainM: null,
      },
    ];
    mockGet.mockResolvedValue(body);

    const result = await getRuns();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/runs");
    expect(result).toBe(body);
  });
});

describe("getRunDetail", () => {
  it("GETs /api/runs/:id and returns the parsed detail", async () => {
    const body = {
      id: "run1",
      source: "manual" as const,
      name: "Morning run",
      startedAt: "2026-09-01T00:00:00.000Z",
      distanceM: 5000,
      durationS: 1800,
      avgPaceSPerKm: 360,
      avgHr: null,
      elevationGainM: null,
      points: [],
    };
    mockGet.mockResolvedValue(body);

    const result = await getRunDetail("run1");

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith("/api/runs/run1");
    expect(result).toBe(body);
  });
});

describe("logManualRun", () => {
  it("POSTs the manual-run input verbatim to /api/runs", async () => {
    const input = { name: "Evening run", startedAt: "2026-09-01T18:00:00.000Z", distanceM: 3000, durationS: 900 };
    const created = { id: "run2", source: "manual" as const, ...input, avgPaceSPerKm: 300, avgHr: null, elevationGainM: null };
    mockPost.mockResolvedValue(created);

    const result = await logManualRun(input);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/runs", input);
    expect(result).toBe(created);
  });
});

describe("deleteRun", () => {
  it("DELETEs /api/runs/:id", async () => {
    mockDel.mockResolvedValue(undefined);

    await deleteRun("run1");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("/api/runs/run1");
  });
});

describe("importRunFile", () => {
  it("POSTs the file as multipart/form-data to /api/runs/import without going through the api wrapper", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { id: "run3", source: "gpx" }));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["gpx contents"], "run.gpx", { type: "application/gpx+xml" });

    const result = await importRunFile(file);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/runs/import");
    expect(init.method).toBe("POST");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("file")).toBe(file);
    // Never a JSON api.post call — this bypasses the shared wrapper entirely.
    expect(mockPost).not.toHaveBeenCalled();
    expect(result).toEqual({ id: "run3", source: "gpx" });
  });

  it("omits the Authorization header when no token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await importRunFile(new File(["x"], "run.gpx"));

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toEqual({});
  });

  it("sends a Bearer Authorization header once a token is set", async () => {
    mockGetToken.mockReturnValue("my-token");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await importRunFile(new File(["x"], "run.gpx"));

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toEqual({ Authorization: "Bearer my-token" });
  });

  it("prefixes the request with apiBase() (native/Capacitor case)", async () => {
    mockApiBase.mockReturnValue("http://192.168.1.5:3000");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await importRunFile(new File(["x"], "run.gpx"));

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("http://192.168.1.5:3000/api/runs/import");
  });

  it("throws with the server's `detail` message on a non-ok JSON response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(422, { detail: "unsupported file format" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRunFile(new File(["x"], "run.gpx"))).rejects.toThrow("unsupported file format");
  });

  it("falls back to `error` when `detail` is absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(400, { error: "bad request" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRunFile(new File(["x"], "run.gpx"))).rejects.toThrow("bad request");
  });

  it("falls back to a generic status message when the error body isn't parseable JSON", async () => {
    const res = {
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("not json")),
    } as unknown as Response;
    const fetchMock = vi.fn().mockResolvedValue(res);
    vi.stubGlobal("fetch", fetchMock);

    await expect(importRunFile(new File(["x"], "run.gpx"))).rejects.toThrow("import failed: 500");
  });
});
