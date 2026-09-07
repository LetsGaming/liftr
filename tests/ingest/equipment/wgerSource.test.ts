import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchWgerFullEquipmentIndex, wgerEquipmentSource } from "~ingest/equipment/wgerSource.js";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, statusText: ok ? "OK" : "Internal Server Error", json: async () => body };
}

const EQUIPMENT_TYPES = [
  { id: 1, name: "Barbell" },
  { id: 2, name: "none (bodyweight exercise)" },
  { id: 3, name: "Bench" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Two-page exercise listing (id -> equipment ids), stitched together across `next`. */
function stubTwoPageFetch() {
  const page1 = { results: [{ id: 10, equipment: [1] }], next: "https://wger.de/api/v2/exercise/?page=2" };
  const page2 = { results: [{ id: 20, equipment: [2, 3] }], next: null };

  return vi.fn(async (url: string) => {
    if (url.includes("/equipment/")) return jsonResponse({ results: EQUIPMENT_TYPES });
    if (url.includes("page=2")) return jsonResponse(page2);
    if (url.includes("/exercise/")) return jsonResponse(page1);
    throw new Error(`unexpected url in test: ${url}`);
  });
}

describe("wgerEquipmentSource.buildIndex", () => {
  it("paginates through /exercise/ via `next` and normalizes each row's equipment ids to a single Equipment value", async () => {
    vi.stubGlobal("fetch", stubTwoPageFetch());

    const index = await wgerEquipmentSource.buildIndex();

    expect(index.get("10")).toBe("barbell");
    // id 20 carries both "none (bodyweight exercise)" and "Bench" — bodyweight wins by priority.
    expect(index.get("20")).toBe("bodyweight");
  });

  it("declares its adapter name as 'wger'", () => {
    expect(wgerEquipmentSource.name).toBe("wger");
  });

  it("throws when a page fetch is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => (url.includes("/equipment/") ? jsonResponse({ results: [] }) : jsonResponse(null, false))),
    );

    await expect(wgerEquipmentSource.buildIndex()).rejects.toThrow(/wger fetch failed/);
  });
});

describe("fetchWgerFullEquipmentIndex", () => {
  it("returns the full un-collapsed equipment name list per exercise id, not just one priority-reduced value", async () => {
    vi.stubGlobal("fetch", stubTwoPageFetch());

    const index = await fetchWgerFullEquipmentIndex();

    expect(index.get("10")).toEqual(["Barbell"]);
    expect(index.get("20")).toEqual(["none (bodyweight exercise)", "Bench"]);
  });

  it("drops an equipment id with no matching name rather than throwing", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.includes("/equipment/")) return jsonResponse({ results: EQUIPMENT_TYPES });
        return jsonResponse({ results: [{ id: 30, equipment: [1, 999] }], next: null });
      }),
    );

    const index = await fetchWgerFullEquipmentIndex();

    expect(index.get("30")).toEqual(["Barbell"]);
  });
});
