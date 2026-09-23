// @vitest-environment jsdom
// useAppUpdate.ts keeps its state as module-level singletons (App.vue's launch check and
// ProfilePage.vue's own display/recheck share one result — see the file's header comment), so
// every test here resets modules and re-imports fresh, same convention as useToast.test.ts.
// jsdom (not this project's default node environment for composables) because openDownload()
// now navigates window.location directly rather than calling out to @capacitor/browser.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { getInfoMock } = vi.hoisted(() => ({
  getInfoMock: vi.fn(),
}));
vi.mock("@capacitor/app", () => ({ App: { getInfo: getInfoMock } }));

function fakeRelease(tagName: string, apkUrl: string | null): Response {
  const assets = apkUrl ? [{ name: "liftr.apk", browser_download_url: apkUrl }] : [];
  return { ok: true, status: 200, json: () => Promise.resolve({ tag_name: tagName, assets }) } as Response;
}

beforeEach(() => {
  vi.resetModules();
  getInfoMock.mockReset().mockResolvedValue({ version: "1.0.0" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isNewerVersion", () => {
  it("returns true when the latest version is greater", async () => {
    const { isNewerVersion } = await import("~client/composables/useAppUpdate");
    expect(isNewerVersion("1.2.0", "1.1.9")).toBe(true);
  });

  it("returns false when versions are equal", async () => {
    const { isNewerVersion } = await import("~client/composables/useAppUpdate");
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
  });

  it("returns false when the latest version is older", async () => {
    const { isNewerVersion } = await import("~client/composables/useAppUpdate");
    expect(isNewerVersion("1.0.0", "1.2.0")).toBe(false);
  });

  it("compares each dotted segment numerically, not lexically (1.2.10 > 1.2.9)", async () => {
    const { isNewerVersion } = await import("~client/composables/useAppUpdate");
    expect(isNewerVersion("1.2.10", "1.2.9")).toBe(true);
  });
});

describe("useAppUpdate", () => {
  it("check() populates currentVersion/latestVersion/downloadUrl and flags updateAvailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.2.0", "https://example.com/liftr.apk")));
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { currentVersion, latestVersion, downloadUrl, updateAvailable, check } = useAppUpdate();

    await check();

    expect(currentVersion.value).toBe("1.0.0");
    expect(latestVersion.value).toBe("1.2.0");
    expect(downloadUrl.value).toBe("https://example.com/liftr.apk");
    expect(updateAvailable.value).toBe(true);
  });

  it("updateAvailable is false when already on the latest version", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.0.0", "https://example.com/liftr.apk")));
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { updateAvailable, check } = useAppUpdate();

    await check();

    expect(updateAvailable.value).toBe(false);
  });

  it("leaves downloadUrl null when the release has no .apk asset", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.2.0", null)));
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { downloadUrl, updateAvailable, check } = useAppUpdate();

    await check();

    expect(downloadUrl.value).toBeNull();
    expect(updateAvailable.value).toBe(true);
  });

  it("sets a user-facing error and leaves updateAvailable false when the check fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { error, updateAvailable, check } = useAppUpdate();

    await check();

    expect(error.value).toBeTruthy();
    expect(updateAvailable.value).toBe(false);
  });

  it("sets checking true during the request and false once settled", async () => {
    let resolveFetch!: (r: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn().mockReturnValue(new Promise<Response>((res) => (resolveFetch = res))),
    );
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { checking, check } = useAppUpdate();

    const pending = check();
    expect(checking.value).toBe(true);
    resolveFetch(fakeRelease("v1.0.0", null));
    await pending;

    expect(checking.value).toBe(false);
  });

  it("shares state across every useAppUpdate() call (module-level singleton)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.2.0", null)));
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const first = useAppUpdate();
    const second = useAppUpdate();

    await first.check();

    expect(second.latestVersion.value).toBe("1.2.0");
  });

  it("openDownload navigates the WebView itself to downloadUrl, not an in-app browser tab (Capacitor hands external-host navigation off to the system browser by default)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.2.0", "https://example.com/liftr.apk")));
    const location = { ...window.location, href: "" };
    vi.stubGlobal("location", location);
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { check, openDownload } = useAppUpdate();
    await check();

    openDownload();

    expect(location.href).toBe("https://example.com/liftr.apk");
  });

  it("openDownload does nothing when there's no download URL", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeRelease("v1.0.0", null)));
    const location = { ...window.location, href: "" };
    vi.stubGlobal("location", location);
    const { useAppUpdate } = await import("~client/composables/useAppUpdate");
    const { check, openDownload } = useAppUpdate();
    await check();

    openDownload();

    expect(location.href).toBe("");
  });
});
