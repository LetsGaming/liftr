import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Two true external boundaries here: Capacitor's native-platform check and the @capacitor/haptics
// plugin itself. Neither exists in a meaningful form under vitest's node environment (no native
// runtime), so both are mocked; everything else (the reduced-motion gate, the tap/bump/success
// mapping, swallowing a rejected native call) is haptics.ts's own logic and is exercised for real.
// vi.mock factories are hoisted above the rest of the file, so any mock fn they reference must
// come from vi.hoisted() — a plain top-level `const` would still be in its temporal dead zone
// when the (hoisted) factory actually runs.
const { isNativePlatformMock, impactMock, notificationMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  impactMock: vi.fn(),
  notificationMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock },
}));

vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact: impactMock, notification: notificationMock },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" },
  NotificationType: { Success: "SUCCESS" },
}));

import { haptics } from "~client/lib/haptics";

function stubMatchMedia(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({ matches }),
  );
}

beforeEach(() => {
  isNativePlatformMock.mockReset().mockReturnValue(true);
  impactMock.mockReset().mockResolvedValue(undefined);
  notificationMock.mockReset().mockResolvedValue(undefined);
  stubMatchMedia(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("haptics.tap", () => {
  it("fires a light impact on a native platform without reduced motion", async () => {
    await haptics.tap();
    expect(impactMock).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("does nothing on a non-native platform", async () => {
    isNativePlatformMock.mockReturnValue(false);
    await haptics.tap();
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("does nothing when prefers-reduced-motion is set, even on a native platform", async () => {
    stubMatchMedia(true);
    await haptics.tap();
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("does not throw when the native impact call rejects", async () => {
    impactMock.mockRejectedValue(new Error("plugin unavailable"));
    await expect(haptics.tap()).resolves.toBeUndefined();
  });

  it("treats a missing matchMedia function as not reduced motion", async () => {
    vi.stubGlobal("matchMedia", undefined);
    await haptics.tap();
    expect(impactMock).toHaveBeenCalledWith({ style: "LIGHT" });
  });
});

describe("haptics.bump", () => {
  it("fires a medium impact on a native platform without reduced motion", async () => {
    await haptics.bump();
    expect(impactMock).toHaveBeenCalledWith({ style: "MEDIUM" });
  });

  it("does nothing on a non-native platform", async () => {
    isNativePlatformMock.mockReturnValue(false);
    await haptics.bump();
    expect(impactMock).not.toHaveBeenCalled();
  });

  it("does nothing under prefers-reduced-motion", async () => {
    stubMatchMedia(true);
    await haptics.bump();
    expect(impactMock).not.toHaveBeenCalled();
  });
});

describe("haptics.success", () => {
  it("fires a success notification on a native platform without reduced motion", async () => {
    await haptics.success();
    expect(notificationMock).toHaveBeenCalledWith({ type: "SUCCESS" });
  });

  it("does nothing on a non-native platform", async () => {
    isNativePlatformMock.mockReturnValue(false);
    await haptics.success();
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("does nothing under prefers-reduced-motion", async () => {
    stubMatchMedia(true);
    await haptics.success();
    expect(notificationMock).not.toHaveBeenCalled();
  });

  it("does not throw when the native notification call rejects", async () => {
    notificationMock.mockRejectedValue(new Error("plugin unavailable"));
    await expect(haptics.success()).resolves.toBeUndefined();
  });
});
