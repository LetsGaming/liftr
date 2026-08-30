import type { LiftrDb } from "@liftr/db";
import { findAllMuscles, findMuscleTrainingLog } from "../repositories/muscleRepository.js";

export interface MuscleLastTrained {
  slug: string;
  lastTrainedAt: string | null; // ISO, or null if never trained
  wasPrimary: boolean; // role of the involvement that produced lastTrainedAt
}

/**
 * One row per muscle: the most recent set that touched it and whether that involvement was
 * primary or secondary. A muscle trained as both primary (recently) and secondary (more
 * recently still) reports whichever happened last — "last trained" is about recency, the
 * primary/secondary distinction only affects how fast @liftr/shared considers it to recover.
 * A real decision (the "most recent per muscle" reduction), not just a fetch — that's what
 * makes this a service rather than something the route calls straight off the repository.
 */
export async function computeMuscleLastTrained(db: LiftrDb): Promise<MuscleLastTrained[]> {
  const [allMuscles, rows] = await Promise.all([findAllMuscles(db), findMuscleTrainingLog(db)]);

  const latest = new Map<string, { loggedAt: Date; role: string }>();
  for (const r of rows) {
    if (!latest.has(r.muscleSlug)) latest.set(r.muscleSlug, { loggedAt: r.loggedAt, role: r.role });
  }

  return allMuscles.map((m) => {
    const found = latest.get(m.slug);
    return {
      slug: m.slug,
      lastTrainedAt: found ? found.loggedAt.toISOString() : null,
      wasPrimary: found ? found.role === "primary" : true,
    };
  });
}
