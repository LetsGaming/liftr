import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~client/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    del: vi.fn(),
  },
}));

import { api } from "~client/lib/api";
import { getPrs } from "~client/services/prService";
import { getRankEvents } from "~client/services/rankEventsService";
import { getXp } from "~client/services/xpService";
import { getStreak } from "~client/services/streakService";
import { getReadiness } from "~client/services/readinessService";
import { getRanks } from "~client/services/rankService";
import { getOverallRank } from "~client/services/overallRankService";
import { deleteWorkout, getWorkout } from "~client/services/workoutService";
import { getBodyweightLogs, logBodyweight } from "~client/services/bodyweightService";

const mockGet = vi.mocked(api.get);
const mockPost = vi.mocked(api.post);
const mockDel = vi.mocked(api.del);

beforeEach(() => {
  vi.clearAllMocks();
});

/** Table of thin fetch-wrapper services that do nothing beyond "call api.<method>(path) and
 *  return its result verbatim" — real request/response handling is covered once, thoroughly, by
 *  tests/client/lib/api.test.ts (base URL, auth header, 204, ApiError, timeout, bodyless DELETE).
 *  Each of these used to be its own 1-2-test file asserting the exact same shape with a
 *  different path; consolidated here instead of duplicated per service. Services that do more
 *  than this (URL interpolation beyond a single id, envelope wrap/unwrap, multiple write
 *  methods) keep their own dedicated file: syncService, exerciseService, runService,
 *  routineService, settingsService, historyService, plannedRouteService, workoutService's
 *  `deleteWorkout` (folded in below, it's still a bare passthrough) and `logBodyweight`
 *  (kept below too — it has a request body worth pinning). */
describe.each([
  { name: "getPrs", path: "/api/prs", call: () => getPrs() },
  { name: "getRankEvents", path: "/api/rank-events", call: () => getRankEvents() },
  { name: "getXp", path: "/api/xp", call: () => getXp() },
  { name: "getStreak", path: "/api/streak", call: () => getStreak() },
  { name: "getReadiness", path: "/api/readiness", call: () => getReadiness() },
  { name: "getRanks", path: "/api/ranks", call: () => getRanks() },
  { name: "getOverallRank", path: "/api/overall-rank", call: () => getOverallRank() },
  { name: "getWorkout", path: "/api/workouts/w1", call: () => getWorkout("w1") },
  { name: "getBodyweightLogs", path: "/api/bodyweight", call: () => getBodyweightLogs() },
])("$name", ({ path, call }) => {
  it(`GETs ${path} and returns the response verbatim`, async () => {
    const response = { marker: "response" };
    mockGet.mockResolvedValue(response);

    const result = await call();

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(path);
    expect(result).toBe(response);
  });
});

describe("deleteWorkout", () => {
  it("DELETEs /api/workouts/:id", async () => {
    mockDel.mockResolvedValue(undefined);

    await deleteWorkout("w1");

    expect(mockDel).toHaveBeenCalledTimes(1);
    expect(mockDel).toHaveBeenCalledWith("/api/workouts/w1");
  });
});

describe("logBodyweight", () => {
  it("POSTs date and weightKg to /api/bodyweight and returns the created entry", async () => {
    const created = { id: "2", date: "2026-02-01", weightKg: 81 };
    mockPost.mockResolvedValue(created);

    const result = await logBodyweight("2026-02-01", 81);

    expect(mockPost).toHaveBeenCalledTimes(1);
    expect(mockPost).toHaveBeenCalledWith("/api/bodyweight", { date: "2026-02-01", weightKg: 81 });
    expect(result).toBe(created);
  });
});
