import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDb } from "@liftr/db";

describe("createDb", () => {
  let tmpDir: string | undefined;

  afterEach(() => {
    if (tmpDir) rmSync(tmpDir, { recursive: true, force: true });
    tmpDir = undefined;
  });

  it("returns a queryable db for an in-memory path with no directory to create", () => {
    const db = createDb(":memory:");

    expect(db.$client.pragma("journal_mode", { simple: true })).toBe("memory");
  });

  it("turns on foreign key enforcement — the schema's cascade/restrict FKs (see schema.ts) are inert without it", () => {
    const db = createDb(":memory:");

    expect(db.$client.pragma("foreign_keys", { simple: true })).toBe(1);
  });

  it("creates the parent directory for a file path that doesn't exist yet, rather than requiring a manual mkdir", () => {
    tmpDir = mkdtempSync(join(tmpdir(), "liftr-db-test-"));
    const dbPath = join(tmpDir, "nested", "does", "not", "exist", "liftr.db");
    expect(existsSync(dbPath)).toBe(false);

    const db = createDb(dbPath);

    expect(existsSync(dbPath)).toBe(true);
    db.$client.close();
  });
});
