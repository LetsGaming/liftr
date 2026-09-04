import { deriveRequirements } from "@liftr/shared";
import { exerciseMuscles, exercises, muscles, type LiftrDb } from "@liftr/db";
import { inArray } from "drizzle-orm";

export function findAllExercisesWithMuscles(db: LiftrDb) {
  return db.query.exercises.findMany({
    with: { exerciseMuscles: { with: { muscle: true } } },
  });
}

export interface CustomExerciseInput {
  slug: string;
  nameKey: string;
  equipment?: string;
  movementPattern: string;
  isBodyweight: boolean;
  /** Optional at creation time (a custom exercise with none is still valid, just invisible to
   *  muscle-filtered browse/suggest until edited) — unknown slugs are silently dropped rather
   *  than failing the whole insert, same tolerant-degrade posture as this file's equipment
   *  parsing elsewhere in the codebase. */
  muscleSlugs?: { slug: string; role: "primary" | "secondary" }[];
}

export async function insertCustomExercise(db: LiftrDb, input: CustomExerciseInput) {
  const { muscleSlugs, ...exerciseFields } = input;
  const requiredEquipment = deriveRequirements({
    slug: exerciseFields.slug,
    equipment: exerciseFields.equipment ?? null,
    movementPattern: exerciseFields.movementPattern,
  });
  const [row] = await db
    .insert(exercises)
    .values({ ...exerciseFields, isCustom: true, requiredEquipment: JSON.stringify(requiredEquipment) })
    .returning();

  if (muscleSlugs && muscleSlugs.length > 0) {
    const knownMuscles = await db.query.muscles.findMany({
      where: inArray(
        muscles.slug,
        muscleSlugs.map((m) => m.slug),
      ),
    });
    const muscleIdBySlug = new Map(knownMuscles.map((m) => [m.slug, m.id]));
    const rowsToInsert = muscleSlugs
      .filter((m) => muscleIdBySlug.has(m.slug))
      .map((m) => ({ exerciseId: row!.id, muscleId: muscleIdBySlug.get(m.slug)!, role: m.role }));
    if (rowsToInsert.length > 0) {
      await db.insert(exerciseMuscles).values(rowsToInsert);
    }
  }

  return row!;
}
