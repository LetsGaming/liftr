import { beforeEach, describe, expect, it } from "vitest";
import { settings, streaks, type LiftrDb } from "@liftr/db";
import { registerStreakRoutes } from "~server/routes/streak.js";
import { createTestApp } from "../helpers/testApp.js";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

describe("GET /api/streak", () => {
  let app: ReturnType<typeof createTestApp>["app"];
  let db: LiftrDb;

  beforeEach(() => {
    const testApp = createTestApp();
    app = testApp.app;
    db = testApp.db;
    registerStreakRoutes(app, db);
  });

  it("returns a zero streak with the default token pool when nothing has ever been logged", async () => {
    const res = await app.inject({ method: "GET", url: "/api/streak" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ streak: 0, tokensRemaining: 2 });
  });

  it("counts back-to-back activity days ending today as the streak", async () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    await db.insert(streaks).values([
      { date: toDateStr(today), kind: "workout" },
      { date: toDateStr(yesterday), kind: "workout" },
    ]);

    const res = await app.inject({ method: "GET", url: "/api/streak" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.streak).toBe(2);
    expect(body.tokensRemaining).toBe(2);
  });

  it("derives a larger token pool from a low workoutsPerWeek in the onboarding profile", async () => {
    await db.insert(settings).values({ key: "profile", value: JSON.stringify({ workoutsPerWeek: 2 }) });

    const res = await app.inject({ method: "GET", url: "/api/streak" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    // ceil(7/2) - 1 = 3 expected-gap-days -> pool of 4, above the flat 2-token default.
    expect(body.tokensRemaining).toBe(4);
  });
});
