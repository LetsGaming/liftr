import { beforeEach, describe, expect, it } from "vitest";
import { type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { readJsonSetting, writeJsonSetting } from "~server/repositories/settingsRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("readJsonSetting", () => {
  it("returns null when the key doesn't exist", async () => {
    const result = await readJsonSetting(db, "missing-key");
    expect(result).toBeNull();
  });

  it("parses back the JSON-encoded value written by writeJsonSetting", async () => {
    await writeJsonSetting(db, "profile", { sex: "female", experienceLevel: "intermediate" });

    const result = await readJsonSetting<{ sex: string; experienceLevel: string }>(db, "profile");

    expect(result).toEqual({ sex: "female", experienceLevel: "intermediate" });
  });

  it("round-trips array values", async () => {
    await writeJsonSetting(db, "ownedEquipment", ["barbell", "dumbbells"]);

    const result = await readJsonSetting<string[]>(db, "ownedEquipment");

    expect(result).toEqual(["barbell", "dumbbells"]);
  });
});

describe("writeJsonSetting", () => {
  it("overwrites an existing key rather than erroring on conflict", async () => {
    await writeJsonSetting(db, "equipment", ["barbell"]);
    await writeJsonSetting(db, "equipment", ["barbell", "kettlebell"]);

    const result = await readJsonSetting<string[]>(db, "equipment");

    expect(result).toEqual(["barbell", "kettlebell"]);
  });

  it("does not affect other keys", async () => {
    await writeJsonSetting(db, "profile", { sex: "male" });
    await writeJsonSetting(db, "equipment", ["barbell"]);

    const profile = await readJsonSetting<{ sex: string }>(db, "profile");
    const equipment = await readJsonSetting<string[]>(db, "equipment");

    expect(profile).toEqual({ sex: "male" });
    expect(equipment).toEqual(["barbell"]);
  });
});
