import { afterEach, describe, expect, it, vi } from "vitest";
import { freeExerciseDbEquipmentSource } from "~ingest/equipment/freeExerciseDbSource.js";

function jsonResponse(body: unknown, ok = true) {
  return { ok, status: ok ? 200 : 500, statusText: ok ? "OK" : "Internal Server Error", json: async () => body };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("freeExerciseDbEquipmentSource.buildIndex", () => {
  it("fetches the exercises.json dump and normalizes each row's equipment via @liftr/shared's vocabulary", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: "Barbell_Curl", equipment: "barbell" },
        { id: "Cable_Row", equipment: "cable" },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);

    const index = await freeExerciseDbEquipmentSource.buildIndex();

    expect(index.get("Barbell_Curl")).toBe("barbell");
    expect(index.get("Cable_Row")).toBe("cable");
    expect(fetchMock).toHaveBeenCalledWith("https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/dist/exercises.json");
  });

  it("normalizes a row with no vocabulary equivalent (e.g. 'bands') to null rather than guessing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: "Band_Pull", equipment: "bands" }])));

    const index = await freeExerciseDbEquipmentSource.buildIndex();

    expect(index.get("Band_Pull")).toBeNull();
  });

  it("normalizes a null equipment value to null", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse([{ id: "Plank", equipment: null }])));

    const index = await freeExerciseDbEquipmentSource.buildIndex();

    expect(index.get("Plank")).toBeNull();
  });

  it("throws (rather than degrading itself) when the fetch is not ok — resolveEquipment.ts is what degrades this", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(null, false)));

    await expect(freeExerciseDbEquipmentSource.buildIndex()).rejects.toThrow(/free-exercise-db fetch failed/);
  });

  it("declares its adapter name as 'free-exercise-db'", () => {
    expect(freeExerciseDbEquipmentSource.name).toBe("free-exercise-db");
  });
});
