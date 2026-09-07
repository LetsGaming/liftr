import { beforeEach, describe, expect, it } from "vitest";
import path from "node:path";
import os from "node:os";
import type { LiftrDb } from "@liftr/db";
import type { FastifyInstance } from "fastify";
import { registerExerciseRoutes } from "~server/routes/exercises.js";
import { createTestApp } from "../helpers/testApp.js";
import { insertTestExercise } from "../helpers/testDb.js";

let app: FastifyInstance;
let db: LiftrDb;

// Only used by the route for a live existsSync() check when computing `hasImage` — doesn't need
// to exist on disk for these tests, which never seed a real demo photo.
const imagesRoot = path.join(os.tmpdir(), "liftr-test-images-does-not-exist");

beforeEach(() => {
  ({ app, db } = createTestApp());
  registerExerciseRoutes(app, db, imagesRoot);
});

describe("GET /api/exercises", () => {
  it("returns an empty array when the catalog is empty", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exercises" });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it("returns a seeded exercise with no muscle tags and hasImage false when no photo is mirrored", async () => {
    const exercise = await insertTestExercise(db, { slug: "bench-press", movementPattern: "push", isBodyweight: false });

    const res = await app.inject({ method: "GET", url: "/api/exercises" });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({
      id: exercise.id,
      slug: "bench-press",
      movementPattern: "push",
      isBodyweight: false,
      isCustom: false,
      hasImage: false,
      muscles: [],
    });
  });

  it("sets a cacheable Cache-Control header on the catalog response", async () => {
    const res = await app.inject({ method: "GET", url: "/api/exercises" });

    expect(res.headers["cache-control"]).toBe("public, max-age=300");
  });
});

describe("POST /api/exercises", () => {
  it("creates a custom exercise and returns 201", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/exercises",
      payload: {
        slug: "my-custom-move",
        name: "My Custom Move",
        movementPattern: "push-horizontal",
        isBodyweight: false,
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body).toMatchObject({ slug: "my-custom-move", name: "My Custom Move", isCustom: true });
  });

  it("rejects a slug with an invalid shape (uppercase/spaces) with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/exercises",
      payload: {
        slug: "My Custom Move",
        name: "My Custom Move",
        movementPattern: "push-horizontal",
        isBodyweight: false,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing name with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/exercises",
      payload: {
        slug: "no-name-move",
        movementPattern: "push-horizontal",
        isBodyweight: false,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });

  it("rejects a missing movementPattern with a 400 invalid_request", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/exercises",
      payload: {
        slug: "no-pattern-move",
        name: "No Pattern Move",
        isBodyweight: false,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: "invalid_request" });
  });
});
