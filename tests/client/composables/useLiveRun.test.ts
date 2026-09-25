// @vitest-environment jsdom
//
// useLiveRun.ts now calls i18n.ts's t(), which reads localStorage at module load (needs a DOM) —
// jsdom's navigator.language always reports "en-US", so i18n.ts's getStoredLocale() would
// otherwise default the shared i18n singleton to "en" for the rest of the test process —
// mountWithProviders.ts resets this for component tests, but this file drives the composable
// directly, bypassing that helper.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { i18n } from "~client/i18n";

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

// Minimal shape of @capacitor/geolocation's `Position`, just what onFix() reads — avoids
// importing that package's types from a test file outside packages/client (same idb/@capacitor
// resolution mismatch vitest.config.ts's alias comments describe, but for type declarations,
// which that runtime-only alias doesn't fix).
interface Position {
  timestamp: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number | null;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
}

beforeEach(() => {
  i18n.global.locale.value = "de";
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

describe("useLiveRun pause()", () => {
  function fixAt(lat: number): Position {
    return {
      timestamp: Date.now(),
      coords: { latitude: lat, longitude: 0, accuracy: 5, altitude: null, altitudeAccuracy: null, heading: null, speed: null },
    } as Position;
  }

  it("stops recording GPS fixes while paused, and resumes recording them on resume()", async () => {
    let onFix: (pos: Position | null, err?: Error) => void = () => {};
    watchPositionMock.mockImplementation((_opts, cb) => {
      onFix = cb;
      return Promise.resolve("watch-1");
    });

    const live = useLiveRun();
    await live.start();

    onFix(fixAt(1));
    expect(live.points.value).toHaveLength(1);

    live.pause();
    onFix(fixAt(2)); // dropped — paused
    expect(live.points.value).toHaveLength(1);

    live.resume();
    onFix(fixAt(3)); // recorded again
    expect(live.points.value).toHaveLength(2);
  });
});
