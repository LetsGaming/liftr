// @vitest-environment jsdom
//
// checkVersionMismatch keeps state as module-level singletons (App.vue's launch check and
// ProfilePage.vue's own display share one result — see useServerConnection.ts's header comment
// on serverVersion/versionMismatch), so every test resets modules and re-imports fresh, same
// convention as useAppUpdate.test.ts.
//
// jsdom (not the default node environment) because checkServerIdentity's error copy goes through
// i18n.ts's t(), which reads localeStore.ts's getStoredLocale() at module load; plain Node's own
// built-in `navigator.language` reflects the host OS locale (German on a German-locale machine),
// while jsdom's always reports "en-US" — without forcing jsdom here, these assertions on the
// English default copy would pass or fail depending on which machine ran them.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getInfoMock, isNativeMock } = vi.hoisted(() => ({ getInfoMock: vi.fn(), isNativeMock: vi.fn() }));
vi.mock("@capacitor/app", () => ({ App: { getInfo: getInfoMock } }));
vi.mock("~client/lib/platform", () => ({ isNative: isNativeMock, isAndroid: () => false }));

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
  vi.resetModules();
  installFakeLocalStorage();
  getInfoMock.mockReset().mockResolvedValue({ version: "1.0.0" });
  isNativeMock.mockReset().mockReturnValue(true);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normalizeServerUrl", () => {
  it("defaults to https:// when no scheme is given", async () => {
    const { normalizeServerUrl } = await import("~client/composables/useServerConnection");
    expect(normalizeServerUrl("liftr.example.com")).toBe("https://liftr.example.com");
  });

  it("keeps an explicit http:// scheme (self-hosted, no TLS yet)", async () => {
    const { normalizeServerUrl } = await import("~client/composables/useServerConnection");
    expect(normalizeServerUrl("http://192.168.1.50:3001")).toBe("http://192.168.1.50:3001");
  });

  it("strips a trailing slash", async () => {
    const { normalizeServerUrl } = await import("~client/composables/useServerConnection");
    expect(normalizeServerUrl("https://liftr.example.com/")).toBe("https://liftr.example.com");
  });

  it("returns null for empty input", async () => {
    const { normalizeServerUrl } = await import("~client/composables/useServerConnection");
    expect(normalizeServerUrl("   ")).toBeNull();
  });

  it("returns null for unparseable input", async () => {
    const { normalizeServerUrl } = await import("~client/composables/useServerConnection");
    expect(normalizeServerUrl("https://")).toBeNull();
  });
});

describe("checkServerIdentity", () => {
  it("succeeds when /api/health responds ok with service: liftr, capturing the version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "1.7.2" })));
    const { checkServerIdentity } = await import("~client/composables/useServerConnection");
    expect(await checkServerIdentity("https://liftr.example.com")).toEqual({ ok: true, version: "1.7.2" });
  });

  it("succeeds with version undefined when the server predates the version field", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr" })));
    const { checkServerIdentity } = await import("~client/composables/useServerConnection");
    expect(await checkServerIdentity("https://liftr.example.com")).toEqual({ ok: true, version: undefined });
  });

  it("fails when the server is unreachable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { checkServerIdentity } = await import("~client/composables/useServerConnection");
    const result = await checkServerIdentity("https://unreachable.example.com");
    expect(result.ok).toBe(false);
  });

  it("fails when something answers but isn't Liftr (no service field)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true })));
    const { checkServerIdentity } = await import("~client/composables/useServerConnection");
    const result = await checkServerIdentity("https://not-liftr.example.com");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("doesn't look like a Liftr instance");
  });

  it("fails on a non-ok response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(500)));
    const { checkServerIdentity } = await import("~client/composables/useServerConnection");
    const result = await checkServerIdentity("https://liftr.example.com");
    expect(result.ok).toBe(false);
  });
});

describe("useServerConnection", () => {
  it("starts with whatever was already stored", async () => {
    localStorage.setItem("liftr.serverUrl", "https://existing.example.com");
    const { useServerConnection } = await import("~client/composables/useServerConnection");
    const { serverUrl } = useServerConnection();
    expect(serverUrl.value).toBe("https://existing.example.com");
  });

  it("verifyAndSave persists the normalized URL, server version and updates serverUrl on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "1.7.2" })));
    const { useServerConnection } = await import("~client/composables/useServerConnection");
    const { serverUrl, error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("liftr.example.com/");

    expect(ok).toBe(true);
    expect(serverUrl.value).toBe("https://liftr.example.com");
    expect(error.value).toBeNull();
    expect(localStorage.getItem("liftr.serverUrl")).toBe("https://liftr.example.com");
    expect(localStorage.getItem("liftr.serverVersion")).toBe("1.7.2");
  });

  it("verifyAndSave rejects invalid input without touching storage", async () => {
    const { useServerConnection } = await import("~client/composables/useServerConnection");
    const { error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("   ");

    expect(ok).toBe(false);
    expect(error.value).toBeTruthy();
    expect(localStorage.getItem("liftr.serverUrl")).toBeNull();
  });

  it("verifyAndSave surfaces the identity-check error without saving", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true })));
    const { useServerConnection } = await import("~client/composables/useServerConnection");
    const { error, verifyAndSave } = useServerConnection();

    const ok = await verifyAndSave("not-liftr.example.com");

    expect(ok).toBe(false);
    expect(error.value).toContain("doesn't look like a Liftr instance");
    expect(localStorage.getItem("liftr.serverUrl")).toBeNull();
  });
});

describe("checkVersionMismatch", () => {
  it("does nothing on a non-native (web/PWA) build — client and server always deploy together there", async () => {
    isNativeMock.mockReturnValue(false);
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { checkVersionMismatch } = await import("~client/composables/useServerConnection");

    expect(await checkVersionMismatch()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does nothing when no server URL is saved yet (first-run setup handles its own check)", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { checkVersionMismatch } = await import("~client/composables/useServerConnection");

    expect(await checkVersionMismatch()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("flags a mismatch and stores the server's version when the two versions differ", async () => {
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "9.9.9" })));
    getInfoMock.mockResolvedValue({ version: "1.0.0" });
    const { checkVersionMismatch, useServerVersionInfo } = await import("~client/composables/useServerConnection");

    const mismatch = await checkVersionMismatch();

    expect(mismatch).toBe(true);
    expect(useServerVersionInfo().versionMismatch.value).toBe(true);
    expect(useServerVersionInfo().serverVersion.value).toBe("9.9.9");
    expect(localStorage.getItem("liftr.serverVersion")).toBe("9.9.9");
  });

  it("reports no mismatch when the versions match", async () => {
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "1.0.0" })));
    getInfoMock.mockResolvedValue({ version: "1.0.0" });
    const { checkVersionMismatch } = await import("~client/composables/useServerConnection");

    expect(await checkVersionMismatch()).toBe(false);
  });

  it("resolves to false (never rejects) when App.getInfo() rejects on-device — warn-only, no unhandled rejection", async () => {
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "9.9.9" })));
    getInfoMock.mockRejectedValue(new Error("plugin not available"));
    const { checkVersionMismatch, useServerVersionInfo } = await import("~client/composables/useServerConnection");

    await expect(checkVersionMismatch()).resolves.toBe(false);
    expect(useServerVersionInfo().versionMismatch.value).toBe(false);
  });

  it("has no internal run-once guard — the caller's own single onMounted is what makes this once-per-boot (App.vue only mounts once)", async () => {
    localStorage.setItem("liftr.serverUrl", "https://liftr.example.com");
    const fetchMock = vi.fn().mockResolvedValue(fakeResponse(200, { ok: true, service: "liftr", version: "9.9.9" }));
    vi.stubGlobal("fetch", fetchMock);
    getInfoMock.mockResolvedValue({ version: "1.0.0" });
    const { checkVersionMismatch } = await import("~client/composables/useServerConnection");

    await checkVersionMismatch();
    await checkVersionMismatch();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
