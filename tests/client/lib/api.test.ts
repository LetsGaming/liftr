import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, apiBase, getToken, setToken } from "~client/lib/api";

// localStorage is a true external (browser storage) boundary that doesn't exist under vitest's
// default node environment — stub a minimal in-memory implementation rather than pulling in a
// full jsdom environment just for this.
function installFakeLocalStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
  });
}

function fakeResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

beforeEach(() => {
  installFakeLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiBase", () => {
  it("returns an empty string when VITE_API_BASE isn't set (dev-server proxy case)", () => {
    expect(apiBase()).toBe("");
  });
});

describe("getToken / setToken", () => {
  it("returns an empty string when no token was ever stored", () => {
    expect(getToken()).toBe("");
  });

  it("round-trips a token through localStorage", () => {
    setToken("secret-token");
    expect(getToken()).toBe("secret-token");
  });
});

describe("ApiError", () => {
  it("carries the HTTP status and sets its name", () => {
    const err = new ApiError("GET /api/x failed: 500", 500);
    expect(err.message).toBe("GET /api/x failed: 500");
    expect(err.status).toBe(500);
    expect(err.name).toBe("ApiError");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("api.get", () => {
  it("requests apiBase() + path with no body and no Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get<{ ok: boolean }>("/api/workouts");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/workouts");
    expect(init.headers["Content-Type"]).toBeUndefined();
    expect(result).toEqual({ ok: true });
  });

  it("omits the Authorization header when no token is set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/api/workouts");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("sends a Bearer Authorization header once a token is set", async () => {
    setToken("my-token");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await api.get("/api/workouts");

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.headers.Authorization).toBe("Bearer my-token");
  });

  it("returns undefined for a 204 No Content response instead of parsing a body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.get("/api/workouts/1");

    expect(result).toBeUndefined();
  });

  it("throws an ApiError with the request method, path, and status on a non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(404));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.get("/api/missing")).rejects.toMatchObject({
      name: "ApiError",
      status: 404,
      message: "GET /api/missing failed: 404",
    });
  });
});

describe("api.post / put / patch", () => {
  it("POSTs a JSON-stringified body with a Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await api.post<{ id: number }>("/api/workouts", { name: "Leg day" });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/workouts");
    expect(init.method).toBe("POST");
    expect(init.body).toBe(JSON.stringify({ name: "Leg day" }));
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(result).toEqual({ id: 1 });
  });

  it("PUTs a JSON-stringified body with a Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await api.put("/api/workouts/1", { name: "Updated" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("PUT");
    expect(init.body).toBe(JSON.stringify({ name: "Updated" }));
  });

  it("PATCHes a JSON-stringified body with a Content-Type header", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);

    await api.patch("/api/workouts/1", { name: "Patched" });

    const [, init] = fetchMock.mock.calls[0]!;
    expect(init.method).toBe("PATCH");
    expect(init.body).toBe(JSON.stringify({ name: "Patched" }));
  });

  it("reports the POST method and path in a thrown ApiError", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(api.post("/api/workouts", {})).rejects.toMatchObject({
      status: 400,
      message: "POST /api/workouts failed: 400",
    });
  });
});

describe("api.del", () => {
  it("sends a bodyless DELETE with no Content-Type header (regression: Fastify 400s a bodyless request carrying one)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(204));
    vi.stubGlobal("fetch", fetchMock);

    await api.del("/api/routines/1");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/routines/1");
    expect(init.method).toBe("DELETE");
    expect(init.body).toBeUndefined();
    expect(init.headers["Content-Type"]).toBeUndefined();
  });
});
