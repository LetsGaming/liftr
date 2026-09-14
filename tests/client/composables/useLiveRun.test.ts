import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const { checkPermissionsMock, requestPermissionsMock, watchPositionMock } = vi.hoisted(() => ({
  checkPermissionsMock: vi.fn(),
  requestPermissionsMock: vi.fn(),
  watchPositionMock: vi.fn(),
}));

vi.mock("@capacitor/geolocation", () => ({
  Geolocation: {
    checkPermissions: checkPermissionsMock,
    requestPermissions: requestPermissionsMock,
    watchPosition: watchPositionMock,
    clearWatch: vi.fn(),
  },
}));

import { useLiveRun } from "~client/composables/useLiveRun";

beforeEach(() => {
  checkPermissionsMock.mockResolvedValue({ location: "granted", coarseLocation: "granted" });
  watchPositionMock.mockRejectedValue(new Error("Geolocation unavailable"));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useLiveRun start() failure copy", () => {
  it("gives an HTTPS-specific message when the page is not a secure context", async () => {
    vi.stubGlobal("isSecureContext", false);
    const live = useLiveRun();
    await live.start();
    expect(live.error.value).toBe("GPS braucht eine sichere (HTTPS-)Verbindung — im Browser nur über HTTPS verfügbar.");
  });

  it("keeps the generic device-check message on a secure context", async () => {
    vi.stubGlobal("isSecureContext", true);
    const live = useLiveRun();
    await live.start();
    expect(live.error.value).toBe("Standort konnte nicht gestartet werden — GPS auf dem Gerät prüfen.");
  });
});
