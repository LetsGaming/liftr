import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  apiBase: vi.fn(() => ""),
  getToken: vi.fn(() => ""),
}));

import { apiBase, getToken } from "~client/lib/api";
import { fetchExportZip } from "~client/services/exportService";

const mockApiBase = vi.mocked(apiBase);
const mockGetToken = vi.mocked(getToken);

function fakeResponse(status: number, blob?: Blob): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    blob: () => Promise.resolve(blob ?? new Blob()),
  } as Response;
}

beforeEach(() => {
  mockApiBase.mockReturnValue("");
  mockGetToken.mockReturnValue("");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("fetchExportZip", () => {
  it("fetches apiBase() + /api/export.zip", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExportZip();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/export.zip");
  });

  it("prefixes the URL with a non-empty apiBase() (native/Capacitor case)", async () => {
    mockApiBase.mockReturnValue("https://lan-server:3000");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExportZip();

    const [url] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://lan-server:3000/api/export.zip");
  });

  it("sends an empty headers object when no token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExportZip();

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toEqual({});
  });

  it("sends a Bearer Authorization header once a token is set", async () => {
    mockGetToken.mockReturnValue("my-token");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200));
    vi.stubGlobal("fetch", fetchMock);

    await fetchExportZip();

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers).toEqual({ Authorization: "Bearer my-token" });
  });

  it("resolves with the response's blob on success", async () => {
    const blob = new Blob(["zip-bytes"]);
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, blob));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExportZip();

    expect(result).toBe(blob);
  });

  it("throws an Error carrying the status on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(500));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchExportZip()).rejects.toThrow("Export fehlgeschlagen: 500");
  });
});
