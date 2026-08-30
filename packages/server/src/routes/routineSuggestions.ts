import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { recommendForChosenExercises, suggestExercisesForMuscles } from "../services/routineSuggestionService.js";
import type { ZodFastifyInstance } from "../types.js";

const suggestInput = z.object({
  muscleSlugs: z.array(z.string()).min(1),
  /** How many exercises to suggest per requested muscle group before de-duping overlaps. */
  exercisesPerMuscle: z.number().int().min(1).max(5).default(2),
  ownedEquipment: z.array(z.string()).optional(),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
});

const recommendInput = z.object({
  exerciseIds: z.array(z.string()).min(1),
  experienceLevel: z.enum(["beginner", "intermediate", "advanced"]).optional(),
});

/** See services/routineSuggestionService.ts for the actual candidate-selection/recommendation
 *  logic — this route is just: validate, call the service, shape the response. */
export function registerRoutineSuggestionRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.post("/api/routines/suggest", { schema: { body: suggestInput } }, async (req) => {
    const exercises = await suggestExercisesForMuscles(db, req.body);
    return { exercises };
  });

  // POST /api/routines/recommend — sets/reps/weight for exercises the user already picked
  // (manual routine-wizard selection, Quick Start), reusing the same recommendation engine as
  // the muscle-group suggester above instead of the hardcoded "8 reps, 0 kg" default those two
  // paths used to fall back to (QUAL-04).
  app.post("/api/routines/recommend", { schema: { body: recommendInput } }, async (req) => {
    const exercises = await recommendForChosenExercises(db, req.body.exerciseIds, req.body.experienceLevel);
    return { exercises };
  });
}
