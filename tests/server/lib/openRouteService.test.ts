import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~server/env.js", () => ({
  env: { orsApiKey: "test-key", orsBaseUrl: "https://ors.test", orsProfile: "foot-walking" },
}));

import { fetchOrsRoute, OrsUnavailableError } from "~server/lib/openRouteService.js";

function orsSuccessBody() {
  return {
    features: [
      {
        geometry: { coordinates: [[13.4021, 52.4732, 40], [13.4025, 52.4736, 42]] },
        properties: { summary: { distance: 123.4 }, ascent: 2 },
      },
    ],
  };
}

function fakeResponse(status: number, body?: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchOrsRoute", () => {
  it("swaps {lat,lon} waypoints to ORS's [lon,lat] order in the request body", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, orsSuccessBody()));

    await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    const call = vi.mocked(fetch).mock.calls[0]!;
    const body = JSON.parse((call[1] as RequestInit).body as string);
    expect(body.coordinates).toEqual([[13.4021, 52.4732], [13.4025, 52.4736]]);
  });

  it("parses coordinates back to {lat,lon,ele}, distance, and ascent on success", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, orsSuccessBody()));

    const result = await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    expect(result.coordinates).toEqual([
      { lon: 13.4021, lat: 52.4732, ele: 40 },
      { lon: 13.4025, lat: 52.4736, ele: 42 },
    ]);
    expect(result.distanceM).toBe(123.4);
    expect(result.elevationGainM).toBe(2);
  });

  it("derives elevation gain from the geometry when ascent is absent", async () => {
    const body = orsSuccessBody();
    delete (body.features[0]!.properties as { ascent?: number }).ascent;
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, body));

    const result = await fetchOrsRoute([{ lat: 52.4732, lon: 13.4021 }, { lat: 52.4736, lon: 13.4025 }]);

    expect(result.elevationGainM).toBe(2); // 40 -> 42
  });

  it("throws OrsUnavailableError with the HTTP status on a non-2xx response", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(401));

    // Not `.rejects.toMatchObject(new OrsUnavailableError(401, expect.any(String)))`: vitest's
    // toMatchObject falls back to strict `a.message === b.message` whenever the expected value
    // is itself an Error instance (subsetEquality declines to handle Error subjects), so an
    // `expect.any(String)` embedded in a constructed Error never actually matches. Assert the
    // type and the field directly instead.
    let error: unknown;
    try {
      await fetchOrsRoute([{ lat: 0, lon: 0 }]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(OrsUnavailableError);
    expect((error as OrsUnavailableError).status).toBe(401);
  });

  it("throws OrsUnavailableError on a network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("fetch failed"));

    await expect(fetchOrsRoute([{ lat: 0, lon: 0 }])).rejects.toBeInstanceOf(OrsUnavailableError);
  });

  it("distinguishes a timeout from other network failures via status \"timeout\"", async () => {
    // fetchOrsRoute uses AbortSignal.timeout(8000), which rejects the fetch promise with a
    // DOMException/Error named "TimeoutError" — that's the exact signal it checks (err.name) to
    // tell a timeout apart from every other network failure (which falls back to "network").
    const timeoutError = new Error("The operation timed out.");
    timeoutError.name = "TimeoutError";
    vi.mocked(fetch).mockRejectedValue(timeoutError);

    let error: unknown;
    try {
      await fetchOrsRoute([{ lat: 0, lon: 0 }]);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(OrsUnavailableError);
    expect((error as OrsUnavailableError).status).toBe("timeout");
  });

  it("throws OrsUnavailableError when the response body doesn't match the expected shape", async () => {
    vi.mocked(fetch).mockResolvedValue(fakeResponse(200, { unexpected: true }));

    await expect(fetchOrsRoute([{ lat: 0, lon: 0 }])).rejects.toBeInstanceOf(OrsUnavailableError);
  });
});
