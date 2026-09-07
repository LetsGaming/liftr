import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { bodyweightLogs, type LiftrDb } from "@liftr/db";
import { registerSettingsRoutes } from "~server/routes/settings.js";
import { createTestApp } from "../helpers/testApp.js";

describe("settings routes", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    registerSettingsRoutes(app, db);
  });

  describe("GET/PUT /api/settings/profile", () => {
    it("returns null before the onboarding guide has ever been completed", async () => {
      const res = await app.inject({ method: "GET", url: "/api/settings/profile" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    });

    it("saves and echoes back the profile", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/profile",
        payload: { sex: "male", birthYear: 1995, experienceLevel: "intermediate", workoutsPerWeek: 4 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sex: "male", birthYear: 1995, experienceLevel: "intermediate", workoutsPerWeek: 4 });

      const getRes = await app.inject({ method: "GET", url: "/api/settings/profile" });
      expect(getRes.json()).toEqual({ sex: "male", birthYear: 1995, experienceLevel: "intermediate", workoutsPerWeek: 4 });
    });

    it("merges a partial update into the existing profile rather than replacing it", async () => {
      await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { sex: "female", workoutsPerWeek: 3 } });
      const res = await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { workoutsPerWeek: 5 } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ sex: "female", workoutsPerWeek: 5 });
    });

    it("also upserts today's bodyweight log when currentWeightKg is provided", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { currentWeightKg: 82.5 } });
      expect(res.statusCode).toBe(200);
      // currentWeightKg isn't itself part of the stored/returned profile shape.
      expect(res.json()).toEqual({});

      const today = new Date().toISOString().slice(0, 10);
      const row = await db.query.bodyweightLogs.findFirst({ where: eq(bodyweightLogs.date, today) });
      expect(row?.weightKg).toBe(82.5);
    });

    it("rejects a birthYear before 1900 with the real 400 shape", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { birthYear: 1800 } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a workoutsPerWeek outside 1-14", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { workoutsPerWeek: 0 } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a malformed body (wrong type for a known field)", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/profile", payload: { sex: "unspecified" } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("GET/PUT /api/settings/equipment", () => {
    it("returns null equipment (not []) before anything is ever configured", async () => {
      const res = await app.inject({ method: "GET", url: "/api/settings/equipment" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ equipment: null });
    });

    it("saves and returns the owned-equipment list", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/equipment",
        payload: { equipment: ["barbell", "dumbbell", "bench"] },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ equipment: ["barbell", "dumbbell", "bench"] });

      const getRes = await app.inject({ method: "GET", url: "/api/settings/equipment" });
      expect(getRes.json()).toEqual({ equipment: ["barbell", "dumbbell", "bench"] });
    });

    it("rejects a body missing the required equipment field", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/equipment", payload: {} });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a non-array equipment value", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/equipment", payload: { equipment: "barbell" } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });

  describe("GET/PUT /api/settings/gym", () => {
    it("returns null before gym setup has ever been configured", async () => {
      const res = await app.inject({ method: "GET", url: "/api/settings/gym" });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toBeNull();
    });

    it("saves and returns bar weights + plate inventory", async () => {
      const payload = {
        barWeights: { barbell: 20, "ez-bar": 10, dumbbell: 2.5 },
        plates: [
          { weightKg: 20, count: 4 },
          { weightKg: 10, count: 2 },
        ],
      };
      const res = await app.inject({ method: "PUT", url: "/api/settings/gym", payload });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(payload);

      const getRes = await app.inject({ method: "GET", url: "/api/settings/gym" });
      expect(getRes.json()).toEqual(payload);
    });

    it("rejects a body missing the required plates array", async () => {
      const res = await app.inject({ method: "PUT", url: "/api/settings/gym", payload: { barWeights: {} } });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a plate entry with a negative count", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/gym",
        payload: { barWeights: {}, plates: [{ weightKg: 20, count: -1 }] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });

    it("rejects a barbell weight above the plausible max", async () => {
      const res = await app.inject({
        method: "PUT",
        url: "/api/settings/gym",
        payload: { barWeights: { barbell: 999 }, plates: [] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json()).toMatchObject({ error: "invalid_request" });
    });
  });
});
