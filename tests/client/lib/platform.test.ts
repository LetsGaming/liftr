import { describe, expect, it, vi } from "vitest";

const { isNativePlatformMock, getPlatformMock } = vi.hoisted(() => ({
  isNativePlatformMock: vi.fn(),
  getPlatformMock: vi.fn(),
}));

vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: isNativePlatformMock, getPlatform: getPlatformMock },
}));

import { isAndroid, isNative } from "~client/lib/platform";

describe("isNative", () => {
  it("returns true when Capacitor reports a native platform", () => {
    isNativePlatformMock.mockReturnValue(true);
    expect(isNative()).toBe(true);
  });

  it("returns false on web", () => {
    isNativePlatformMock.mockReturnValue(false);
    expect(isNative()).toBe(false);
  });
});

describe("isAndroid", () => {
  it("returns true only when native and the platform is android", () => {
    isNativePlatformMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("android");
    expect(isAndroid()).toBe(true);
  });

  it("returns false when native but not android (e.g. iOS)", () => {
    isNativePlatformMock.mockReturnValue(true);
    getPlatformMock.mockReturnValue("ios");
    expect(isAndroid()).toBe(false);
  });

  it("returns false on web even if getPlatform somehow reports android", () => {
    isNativePlatformMock.mockReturnValue(false);
    getPlatformMock.mockReturnValue("android");
    expect(isAndroid()).toBe(false);
  });
});
