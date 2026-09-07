import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CatalogEntry } from "~ingest/catalogSchema.js";
import { ingestImages } from "~ingest/ingestImages.js";

function entry(overrides: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    slug: "back-squat",
    wgerId: null,
    freeExerciseDbId: null,
    wgerImageId: null,
    nameDe: "Kniebeuge",
    nameEn: "Back Squat",
    equipment: "barbell",
    requiresEquipment: null,
    movementPattern: "squat",
    primaryMuscles: [],
    secondaryMuscles: [],
    isBodyweight: false,
    bodyweightLeverage: null,
    anchor: null,
    ratio: null,
    trust: "derived",
    ...overrides,
  };
}

function okBinary(text: string) {
  return { ok: true, arrayBuffer: async () => Buffer.from(text) };
}
function notFound() {
  return { ok: false, arrayBuffer: async () => Buffer.from("") };
}
function okJson(body: unknown) {
  return { ok: true, json: async () => body };
}

let tmpDir: string | undefined;

afterEach(() => {
  vi.unstubAllGlobals();
  if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
  tmpDir = undefined;
});

describe("ingestImages", () => {
  it("mirrors free-exercise-db's start/end photos to <imagesDir>/<slug>/{start,end}.jpg", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/Back_Squat/0.jpg")) return okBinary("start-bytes");
        if (url.endsWith("/Back_Squat/1.jpg")) return okBinary("end-bytes");
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    await ingestImages([entry({ slug: "back-squat", freeExerciseDbId: "Back_Squat" })], tmpDir);

    expect(readFileSync(join(tmpDir, "back-squat", "start.jpg"), "utf-8")).toBe("start-bytes");
    expect(readFileSync(join(tmpDir, "back-squat", "end.jpg"), "utf-8")).toBe("end-bytes");
  });

  it("warns and leaves a partial mirror when only one of the start/end photos exists upstream", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.endsWith("/0.jpg") ? okBinary("start-bytes") : notFound())),
    );

    await ingestImages([entry({ slug: "back-squat", freeExerciseDbId: "Back_Squat" })], tmpDir);

    expect(existsSync(join(tmpDir, "back-squat", "start.jpg"))).toBe(true);
    expect(existsSync(join(tmpDir, "back-squat", "end.jpg"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing image(s) for "back-squat"'));
  });

  it("falls back to wger's single photo when freeExerciseDbId is unset but wgerImageId is present", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/exerciseimage/?exercise=1736")) return okJson({ results: [{ image: "https://wger.de/media/exercise-images/1736/photo.jpg" }] });
        if (url === "https://wger.de/media/exercise-images/1736/photo.jpg") return okBinary("wger-bytes");
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    await ingestImages([entry({ slug: "single-leg-rdl", freeExerciseDbId: null, wgerImageId: 1736 })], tmpDir);

    expect(readFileSync(join(tmpDir, "single-leg-rdl", "start.jpg"), "utf-8")).toBe("wger-bytes");
    expect(existsSync(join(tmpDir, "single-leg-rdl", "end.jpg"))).toBe(false);
  });

  it("prefers free-exercise-db over the wger fallback when both ids are set", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith("/Back_Squat/0.jpg") || url.endsWith("/Back_Squat/1.jpg")) return okBinary("fedb-bytes");
      throw new Error(`unexpected url (wger should not be reached): ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    await ingestImages([entry({ slug: "back-squat", freeExerciseDbId: "Back_Squat", wgerImageId: 1736 })], tmpDir);

    expect(readFileSync(join(tmpDir, "back-squat", "start.jpg"), "utf-8")).toBe("fedb-bytes");
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toContain("exerciseimage");
    }
  });

  it("warns and writes nothing when wger has no image for the given wgerImageId", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => okJson({ results: [] })));

    await ingestImages([entry({ slug: "no-photo", wgerImageId: 999 })], tmpDir);

    expect(existsSync(join(tmpDir, "no-photo", "start.jpg"))).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no wger image found for "no-photo"'));
  });

  it("skips entries with neither a freeExerciseDbId nor a wgerImageId, touching neither network nor disk", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await ingestImages([entry({ slug: "no-source" })], tmpDir);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(existsSync(join(tmpDir, "no-source"))).toBe(false);
  });

  it("logs a summary with correct per-source and skipped counts", async () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-ingest-images-"));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/Free_A/")) return okBinary("x");
        if (url.includes("/exerciseimage/")) return okJson({ results: [{ image: "https://wger.de/media/x.jpg" }] });
        if (url === "https://wger.de/media/x.jpg") return okBinary("y");
        throw new Error(`unexpected url: ${url}`);
      }),
    );

    await ingestImages(
      [
        entry({ slug: "a", freeExerciseDbId: "Free_A" }),
        entry({ slug: "b", freeExerciseDbId: null, wgerImageId: 5 }),
        entry({ slug: "c", freeExerciseDbId: null, wgerImageId: null }),
      ],
      tmpDir,
    );

    expect(log).toHaveBeenCalledWith("images: mirrored 1 (free-exercise-db) + 1 (wger), skipped 1 (no source id) of 3");
  });
});
