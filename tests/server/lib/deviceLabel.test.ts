import { describe, expect, it } from "vitest";
import { deviceLabel } from "~server/lib/deviceLabel.js";

describe("deviceLabel", () => {
  it("returns a fallback for a missing User-Agent", () => {
    expect(deviceLabel(null)).toBe("Unbekanntes Gerät");
    expect(deviceLabel(undefined)).toBe("Unbekanntes Gerät");
    expect(deviceLabel("")).toBe("Unbekanntes Gerät");
  });

  it("labels a desktop Chrome/Windows UA", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
    expect(deviceLabel(ua)).toBe("Chrome · Windows");
  });

  it("labels an iPhone Safari UA", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(deviceLabel(ua)).toBe("Safari · iPhone");
  });

  it("labels an Android Chrome UA", () => {
    const ua = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36";
    expect(deviceLabel(ua)).toBe("Chrome · Android");
  });

  it("labels a Firefox/Linux UA", () => {
    const ua = "Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0";
    expect(deviceLabel(ua)).toBe("Firefox · Linux");
  });

  it("falls back to Unbekannt for an unrecognized browser or OS token", () => {
    expect(deviceLabel("SomeWeirdCrawler/1.0")).toBe("Unbekannt · Unbekannt");
  });
});
