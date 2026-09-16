import { beforeEach, describe, expect, it } from "vitest";
import type { LiftrDb } from "@liftr/db";
import { findRecentErrorLogs, insertErrorLog, pruneErrorLogs } from "~server/repositories/errorLogRepository.js";
import { createTestDb } from "../helpers/testDb.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("pruneErrorLogs", () => {
  it("keeps only the most recent `keep` rows", async () => {
    // Explicit, strictly-increasing timestamps — back-to-back inserts can otherwise land in the
    // same millisecond, making "most recent" ambiguous and this assertion flaky.
    for (let i = 0; i < 5; i++) {
      await insertErrorLog(db, {
        method: "GET",
        url: `/api/x${i}`,
        statusCode: 500,
        message: `err ${i}`,
        occurredAt: new Date(2026, 0, 1, 0, 0, i),
      });
    }
    await pruneErrorLogs(db, 3);
    const rows = await findRecentErrorLogs(db, 10);
    expect(rows).toHaveLength(3);
    // Newest 3 (err 4, err 3, err 2) survive; err 0/err 1 are pruned.
    expect(rows.map((r) => r.message)).toEqual(["err 4", "err 3", "err 2"]);
  });

  it("is a no-op when under the cap", async () => {
    await insertErrorLog(db, { method: "GET", url: "/api/x", statusCode: 500, message: "only one" });
    await pruneErrorLogs(db, 200);
    expect(await findRecentErrorLogs(db, 10)).toHaveLength(1);
  });
});
