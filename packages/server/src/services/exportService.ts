import type { LiftrDb } from "@liftr/db";
import { toCsv } from "../csv.js";
import {
  findAllBodyweightLogsForExport,
  findAllRunsForExport,
  findAllSetsForExport,
  findAllWorkoutsForExport,
} from "../repositories/exportRepository.js";
import { buildZip } from "../zip.js";

/**
 * Data export / backup (plan Phase 6.5): every logged fact — workouts, sets, runs, bodyweight —
 * as plain CSVs in a zip. This is the "own your data" principle applied to leaving the app: no
 * proprietary format, readable in a spreadsheet with zero tooling, works even if Liftr itself
 * is gone.
 */
export async function buildExportZip(db: LiftrDb): Promise<Buffer> {
  const [workoutRows, setRows, runRows, bodyweightRows] = await Promise.all([
    findAllWorkoutsForExport(db),
    findAllSetsForExport(db),
    findAllRunsForExport(db),
    findAllBodyweightLogsForExport(db),
  ]);

  const workoutsCsv = toCsv(
    ["id", "routineId", "startedAt", "endedAt", "pausedSeconds", "notes"],
    workoutRows.map((w) => [w.id, w.routineId, w.startedAt.toISOString(), w.endedAt?.toISOString() ?? "", w.pausedSeconds, w.notes]),
  );

  const setsCsv = toCsv(
    ["id", "workoutId", "exerciseSlug", "setIndex", "weightKg", "reps", "rpe", "isWarmup", "notes", "loggedAt"],
    setRows.map((s) => [
      s.id,
      s.workoutId,
      s.exerciseSlug,
      s.setIndex,
      s.weightKg,
      s.reps,
      s.rpe,
      s.isWarmup,
      s.notes,
      s.loggedAt.toISOString(),
    ]),
  );

  const runsCsv = toCsv(
    ["id", "source", "name", "startedAt", "distanceM", "durationS", "avgPaceSPerKm", "avgHr", "elevationGainM"],
    runRows.map((r) => [r.id, r.source, r.name, r.startedAt.toISOString(), r.distanceM, r.durationS, r.avgPaceSPerKm, r.avgHr, r.elevationGainM]),
  );

  const bodyweightCsv = toCsv(
    ["id", "date", "weightKg"],
    bodyweightRows.map((b) => [b.id, b.date, b.weightKg]),
  );

  return buildZip([
    { name: "workouts.csv", data: Buffer.from(workoutsCsv, "utf-8") },
    { name: "sets.csv", data: Buffer.from(setsCsv, "utf-8") },
    { name: "runs.csv", data: Buffer.from(runsCsv, "utf-8") },
    { name: "bodyweight.csv", data: Buffer.from(bodyweightCsv, "utf-8") },
  ]);
}
