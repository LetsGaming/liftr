import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import { readJsonSetting, writeJsonSetting } from "~server/repositories/settingsRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("readJsonSetting", () => {
  it("returns null when the key doesn't exist", async () => {
    const result = await readJsonSetting(db, OWNER_USER_ID, "missing-key");
    expect(result).toBeNull();
  });

  it("parses back the JSON-encoded value written by writeJsonSetting", async () => {
    await writeJsonSetting(db, OWNER_USER_ID, "profile", { sex: "female", experienceLevel: "intermediate" });

    const result = await readJsonSetting<{ sex: string; experienceLevel: string }>(db, OWNER_USER_ID, "profile");

    expect(result).toEqual({ sex: "female", experienceLevel: "intermediate" });
  });

  it("round-trips array values", async () => {
    await writeJsonSetting(db, OWNER_USER_ID, "ownedEquipment", ["barbell", "dumbbells"]);

    const result = await readJsonSetting<string[]>(db, OWNER_USER_ID, "ownedEquipment");

    expect(result).toEqual(["barbell", "dumbbells"]);
  });
});

describe("writeJsonSetting", () => {
  it("overwrites an existing key rather than erroring on conflict", async () => {
    await writeJsonSetting(db, OWNER_USER_ID, "equipment", ["barbell"]);
    await writeJsonSetting(db, OWNER_USER_ID, "equipment", ["barbell", "kettlebell"]);

    const result = await readJsonSetting<string[]>(db, OWNER_USER_ID, "equipment");

    expect(result).toEqual(["barbell", "kettlebell"]);
  });

  it("does not affect other keys", async () => {
    await writeJsonSetting(db, OWNER_USER_ID, "profile", { sex: "male" });
    await writeJsonSetting(db, OWNER_USER_ID, "equipment", ["barbell"]);

    const profile = await readJsonSetting<{ sex: string }>(db, OWNER_USER_ID, "profile");
    const equipment = await readJsonSetting<string[]>(db, OWNER_USER_ID, "equipment");

    expect(profile).toEqual({ sex: "male" });
    expect(equipment).toEqual(["barbell"]);
  });
});
