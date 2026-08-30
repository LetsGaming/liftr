import { deriveRequirements } from "@liftr/shared";
import { exercises, type LiftrDb } from "@liftr/db";

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
}

export async function insertCustomExercise(db: LiftrDb, input: CustomExerciseInput) {
  const requiredEquipment = deriveRequirements({
    slug: input.slug,
    equipment: input.equipment ?? null,
    movementPattern: input.movementPattern,
  });
  const [row] = await db
    .insert(exercises)
    .values({ ...input, isCustom: true, requiredEquipment: JSON.stringify(requiredEquipment) })
    .returning();
  return row!;
}
