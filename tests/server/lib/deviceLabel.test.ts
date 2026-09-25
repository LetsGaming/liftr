import { describe, expect, it } from "vitest";
import { deviceLabel } from "~server/lib/deviceLabel.js";

describe("deviceLabel", () => {
  it("returns null for a missing User-Agent", () => {
    expect(deviceLabel(null)).toBeNull();
    expect(deviceLabel(undefined)).toBeNull();
    expect(deviceLabel("")).toBeNull();
  });

  it("labels a desktop Chrome/Windows UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(deviceLabel(ua)).toEqual({ os: "Windows", browser: "Chrome" });
  });

  it("labels an iPhone Safari UA", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toEqual({ os: "iPhone", browser: "Safari" });
  });

  it("labels an Android Chrome UA", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    expect(deviceLabel(ua)).toEqual({ os: "Android", browser: "Chrome" });
  });

  it("labels a Firefox/Linux UA", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
    expect(deviceLabel(ua)).toEqual({ os: "Linux", browser: "Firefox" });
  });

  it("returns null fields for an unrecognized browser or OS token", () => {
    expect(deviceLabel("SomeWeirdCrawler/1.0")).toEqual({ os: null, browser: null });
  });
});
