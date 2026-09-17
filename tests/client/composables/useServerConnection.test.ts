import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkServerIdentity, normalizeServerUrl, useServerConnection } from "~client/composables/useServerConnection";

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
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) } as Response;
}

beforeEach(() => {
  installFakeLocalStorage();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeServerUrl", () => {
  it("defaults to https:// when no scheme is given", () => {
    expect(normalizeServerUrl("liftr.example.com")).toBe("https://liftr.example.com");
  });

  it("keeps an explicit http:// scheme (self-hosted, no TLS yet)", () => {
    expect(normalizeServerUrl("http://192.168.1.50:3001")).toBe("http://192.168.1.50:3001");
  });

  it("strips a trailing slash", () => {
    expect(normalizeServerUrl("https://liftr.example.com/")).toBe("https://liftr.example.com");
  });

  it("returns null for empty input", () => {
    expect(normalizeServerUrl("   ")).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(normalizeServerUrl("https://")).toBeNull();
  });
});

describe("checkServerIdentity", () => {
  it("succeeds when /api/health responds ok with service: liftr", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr" })));
    expect(await checkServerIdentity("https://liftr.example.com")).toEqual({ ok: true });
  });

  it("fails when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const result = await checkServerIdentity("https://unreachable.example.com");
    expect(result.ok).toBe(false);
  });

  it("fails when something answers but isn't Liftr (no service field)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true })));
    const result = await checkServerIdentity("https://not-liftr.example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("keine Liftr-Instanz");
  });

  it("fails on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(500)));
    const result = await checkServerIdentity("https://liftr.example.com");
    expect(result.ok).toBe(false);
  });
});

describe("useServerConnection", () => {
  it("starts with whatever was already stored", () => {
    localStorage.setItem("liftr.serverUrl", "https://existing.example.com");
    const { serverUrl } = useServerConnection();
    expect(serverUrl.value).toBe("https://existing.example.com");
  });

  it("verifyAndSave persists the normalized URL and updates serverUrl on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr" })));
    const { serverUrl, error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("liftr.example.com/");

    expect(ok).toBe(true);
    expect(serverUrl.value).toBe("https://liftr.example.com");
    expect(error.value).toBeNull();
    expect(localStorage.getItem("liftr.serverUrl")).toBe("https://liftr.example.com");
  });

  it("verifyAndSave rejects invalid input without touching storage", async () => {
    const { error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("   ");

    expect(ok).toBe(false);
    expect(error.value).toBeTruthy();
    expect(localStorage.getItem("liftr.serverUrl")).toBeNull();
  });

  it("verifyAndSave surfaces the identity-check error without saving", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true })));
    const { error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("not-liftr.example.com");

    expect(ok).toBe(false);
    expect(error.value).toContain("keine Liftr-Instanz");
    expect(localStorage.getItem("liftr.serverUrl")).toBeNull();
  });
});
