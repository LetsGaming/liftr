import { summarizeRun, type RunPoint } from "@liftr/shared";
import type { LiftrDb } from "@liftr/db";
import { parseFit } from "../fit.js";
import { parseGpx } from "../gpx.js";
import { findRunByClientId, insertRun, insertRunPoints, type NewRun } from "../repositories/runRepository.js";
import { creditStreak } from "../repositories/streakRepository.js";

/**
 * Running (plan Phase 4): import a GPX you own, or log a run manually with no file. All three
 * write paths below converge on the same `runs` + `run_points` tables and the same
 * history/streak plumbing — a manual entry and an imported one are indistinguishable downstream
 * (plan 4.4). Factored here (not left as three near-identical route handlers) because that
 * convergence is exactly the kind of duplicated-across-a-boundary shape that drifts if repeated.
 */
async function persistRun(db: LiftrDb, run: NewRun, points: (RunPoint & { idx: number })[]) {
  const inserted = await insertRun(db, run);
  await insertRunPoints(db, inserted.id, points);
  const dateStr = run.startedAt.toISOString().slice(0, 10);
  await creditStreak(db, dateStr, "run");
  return inserted;
}

export class UnsupportedFileFormatError extends Error {}
export class RunParseError extends Error {}

/** POST /api/runs/import — GPX or FIT file bytes in, a stored run + full point array out. */
export async function importRunFile(db: LiftrDb, filename: string, buffer: Buffer) {
  const lower = filename.toLowerCase();
  const isGpx = lower.endsWith(".gpx");
  const isFit = lower.endsWith(".fit");
  if (!isGpx && !isFit) throw new UnsupportedFileFormatError("only .gpx and .fit are supported");

  let points: RunPoint[];
  try {
    points = isGpx ? parseGpx(buffer.toString("utf-8")) : parseFit(buffer);
  } catch (err) {
    throw new RunParseError((err as Error).message);
  }

  const summary = summarizeRun(points);
  const startedAt = new Date(points[0]!.t);

  return persistRun(
    db,
    {
      source: isGpx ? "gpx" : "fit",
      name: filename.replace(/\.(gpx|fit)$/i, ""),
      startedAt,
      clientId: crypto.randomUUID(),
      distanceM: summary.distanceM,
      durationS: summary.durationS,
      avgPaceSPerKm: summary.avgPaceSPerKm,
      avgHr: summary.avgHr,
      elevationGainM: summary.elevationGainM,
    },
    points.map((p, idx) => ({ ...p, idx })),
  );
}

export interface HealthConnectPoint {
  t: Date;
  lat: number;
  lon: number;
  ele?: number | null;
  hr?: number | null;
}

/** POST /api/runs/healthconnect — native in-app import via capacitor-health (plan Phase 5). */
export async function importHealthConnectRun(db: LiftrDb, platformId: string, name: string | null, rawPoints: HealthConnectPoint[]) {
  const clientId = `healthconnect:${platformId}`;
  const existing = await findRunByClientId(db, clientId);
  if (existing) return existing; // already imported this workout — idempotent, not an error

  const points = rawPoints.map((p) => ({ t: p.t.getTime(), lat: p.lat, lon: p.lon, ele: p.ele ?? undefined, hr: p.hr ?? undefined }));
  const summary = summarizeRun(points);
  const startedAt = new Date(points[0]!.t);

  return persistRun(
    db,
    {
      source: "healthconnect",
      name,
      startedAt,
      clientId,
      distanceM: summary.distanceM,
      durationS: summary.durationS,
      avgPaceSPerKm: summary.avgPaceSPerKm,
      avgHr: summary.avgHr,
      elevationGainM: summary.elevationGainM,
    },
    points.map((p, idx) => ({ ...p, idx })),
  );
}

/** POST /api/runs — manual fallback for runs without a file (plan 4.4). */
export function logManualRun(db: LiftrDb, input: { name: string | null; startedAt: Date; distanceM: number; durationS: number }) {
  return persistRun(
    db,
    {
      source: "manual",
      name: input.name,
      startedAt: input.startedAt,
      clientId: crypto.randomUUID(),
      distanceM: input.distanceM,
      durationS: input.durationS,
      avgPaceSPerKm: input.distanceM > 0 ? input.durationS / (input.distanceM / 1000) : null,
    },
    [],
  );
}
