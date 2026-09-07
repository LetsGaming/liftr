import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ingestMuscleAssets } from "~ingest/ingestMuscleAssets.js";

// Minimal fixtures exercising every recolor pass ingestMuscleAssets.ts runs:
//  - recolorBody: grayscale fill:#RRGGBB values remapped by luminance into the dark-theme range.
//    #000000 (luminance 0, the darkest in this 2-value fixture) and #ffffff (luminance 255, the
//    lightest) land exactly on BODY_DARK/BODY_LIGHT (t=0 / t=1) — see that constant's own values
//    (#1a2033 / #4f5c82, matching the recolorBody doc comment's own worked example).
const BODY_SVG = `<svg><path style="fill:#000000"/><path style="fill:#ffffff"/></svg>`;
//  - recolorOverlay: wger's baked primary/secondary colors + low opacity swapped for this app's
//    tokens and a near-opaque value.
const MAIN_SVG = `<svg><path style="fill:#fc0000;opacity:0.52424239;"/></svg>`;
const SECONDARY_SVG = `<svg><path style="fill:#f57900;"/></svg>`;

function textResponse(text: string) {
  return { ok: true, text: async () => text };
}

let tmpDir: string | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

function stubFetch() {
  return vi.fn(async (url: string) => {
    if (url.endsWith("muscular_system_front.svg") || url.endsWith("muscular_system_back.svg")) return textResponse(BODY_SVG);
    if (/\/main\/muscle-\d+\.svg$/.test(url)) return textResponse(MAIN_SVG);
    if (/\/secondary\/muscle-\d+\.svg$/.test(url)) return textResponse(SECONDARY_SVG);
    throw new Error(`unexpected url in test: ${url}`);
  });
}

describe("ingestMuscleAssets", () => {
  it("remaps the base body outlines' grayscale fills into the dark-theme luminance range", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-muscles-"));
    vi.stubGlobal("fetch", stubFetch());

    await ingestMuscleAssets(tmpDir);

    const front = readFileSync(join(tmpDir, "muscles", "front-body.svg"), "utf-8");
    expect(front).toContain("fill:#1a2033"); // darkest source value -> BODY_DARK
    expect(front).toContain("fill:#4f5c82"); // lightest source value -> BODY_LIGHT
    expect(front).not.toContain("#000000");
    expect(front).not.toContain("#ffffff");

    const back = readFileSync(join(tmpDir, "muscles", "back-body.svg"), "utf-8");
    expect(back).toContain("fill:#1a2033");
    expect(back).toContain("fill:#4f5c82");
  });

  it("recolors a main overlay's primary color and boosts its opacity toward opaque", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-muscles-"));
    vi.stubGlobal("fetch", stubFetch());

    await ingestMuscleAssets(tmpDir);

    const main = readFileSync(join(tmpDir, "muscles", "main", "muscle-1.svg"), "utf-8");
    expect(main).toContain("#8fd0ff");
    expect(main).toContain("opacity:0.92;");
    expect(main).not.toContain("#fc0000");
    expect(main).not.toContain("0.52424239");
  });

  it("recolors a secondary overlay's secondary color to the app's --mm-sec token", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-muscles-"));
    vi.stubGlobal("fetch", stubFetch());

    await ingestMuscleAssets(tmpDir);

    const secondary = readFileSync(join(tmpDir, "muscles", "secondary", "muscle-1.svg"), "utf-8");
    expect(secondary).toContain("#5f7fd6");
    expect(secondary).not.toContain("#f57900");
  });

  it("derives the fatigue variant from the already-written main file (no re-fetch) by swapping in the fire-orange token", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-muscles-"));
    const fetchMock = stubFetch();
    vi.stubGlobal("fetch", fetchMock);

    await ingestMuscleAssets(tmpDir);

    const fatigue = readFileSync(join(tmpDir, "muscles", "fatigue", "muscle-1.svg"), "utf-8");
    expect(fatigue).toContain("#ff7a1f");
    expect(fatigue).not.toContain("#8fd0ff");
    // still carries the boosted opacity from the main-overlay recolor pass, untouched by the
    // fatigue pass (only the primary color string is swapped).
    expect(fatigue).toContain("opacity:0.92;");
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("fatigue");
    }
  });

  it("mirrors all 15 muscles' overlays plus both base bodies, and logs the count", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-muscles-"));
    vi.stubGlobal("fetch", stubFetch());
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    await ingestMuscleAssets(tmpDir);

    expect(readFileSync(join(tmpDir, "muscles", "main", "muscle-15.svg"), "utf-8")).toContain("#8fd0ff");
    expect(log).toHaveBeenCalledWith("muscle assets: mirrored 2 base bodies + 15 muscle overlays (main+secondary+fatigue)");
  });
});
