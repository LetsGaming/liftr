/**
 * Feature: onboarding setup guide ("gender, age, weight, prior experience... workouts per
 * week") + owned-equipment filtering. Backed by the existing generic `settings` k/v table
 * (already used for defaultBodyweightKg) rather than dedicated tables — this is a single-user,
 * no-accounts app (plan 1.1 / audit §5), so there's exactly one profile and one equipment set,
 * which is exactly what a k/v row already models with no schema change needed.
 */
import type { LiftrDb } from "@liftr/db";
import { z } from "zod";
import { upsertBodyweightLog } from "../repositories/bodyweightRepository.js";
import { readJsonSetting, writeJsonSetting } from "../repositories/settingsRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const PROFILE_KEY = "profile";
const EQUIPMENT_KEY = "ownedEquipment";
const GYM_KEY = "gymSetup";

const experienceLevel = z.enum(["beginner", "intermediate", "advanced"]);

const profileInput = z.object({
  sex: z.enum(["male", "female"]).optional(),
  birthYear: z.number().int().min(1900).max(new Date().getFullYear()).optional(),
  experienceLevel: experienceLevel.optional(),
  workoutsPerWeek: z.number().int().min(1).max(14).optional(),
  /** Convenience: also upserts today's bodyweightLogs entry (same field rankEngine.ts reads
   *  for load_ratio ranks) — the onboarding guide asks for weight once, not twice. */
  currentWeightKg: z.number().positive().max(400).optional(),
});
export type ProfileInput = z.infer<typeof profileInput>;
export type Profile = Omit<ProfileInput, "currentWeightKg">;

const profileResponse = z
  .object({
    sex: z.enum(["male", "female"]),
    birthYear: z.number(),
    experienceLevel,
    workoutsPerWeek: z.number(),
  })
  .partial();

const equipmentInput = z.object({ equipment: z.array(z.string()) });
const equipmentResponse = z.object({ equipment: z.array(z.string()).nullable() });

/** Feature: "specify which weight plates you have (e.g. 4x1kg, 2x5kg)... showing the user how
 *  to load the barbell" — same single-user k/v pattern as profile/equipment above.
 *
 * Feedback: "usually a barbell has a different weight than a dumbbell [handle]" — one flat
 * barWeightKg was wrong for mixed equipment (a barbell, EZ-bar, trap-bar, and an adjustable-
 * dumbbell handle are all meaningfully different empty weights). Each is optional: a user who
 * only owns a barbell has no reason to also configure an EZ-bar weight, and SetEntry.vue falls
 * back to @liftr/shared's DEFAULT_BAR_WEIGHT_KG for whichever type isn't set. */
const plateInventoryEntry = z.object({ weightKg: z.number().positive(), count: z.number().int().min(0) });
const barWeightsInput = z.object({
  barbell: z.number().positive().max(50).optional(),
  "ez-bar": z.number().positive().max(50).optional(),
  "trap-bar": z.number().positive().max(50).optional(),
  /** Adjustable-dumbbell handle (not a full fixed-weight dumbbell) — a real but less common
   *  home-gym setup: short handle + your own plates per side, same "bar" math either way. */
  dumbbell: z.number().positive().max(10).optional(),
});
const gymSetupInput = z.object({
  barWeights: barWeightsInput,
  plates: z.array(plateInventoryEntry),
});
export type GymSetup = z.infer<typeof gymSetupInput>;
export type BarWeights = z.infer<typeof barWeightsInput>;
const gymSetupResponse = gymSetupInput.nullable();

export function registerSettingsRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  // GET /api/settings/profile — null until the onboarding guide has been completed once.
  app.get("/api/settings/profile", { schema: { response: { 200: profileResponse.nullable() } } }, async () => {
    return readJsonSetting<Profile>(db, PROFILE_KEY);
  });

  // PUT /api/settings/profile — onboarding guide's save, and ProfilePage.vue's later edits.
  app.put(
    "/api/settings/profile",
    { schema: { body: profileInput, response: { 200: profileResponse } } },
    async (req) => {
      const { currentWeightKg, ...profile } = req.body;

      const existing = await readJsonSetting<Profile>(db, PROFILE_KEY);
      const merged: Profile = { ...existing, ...profile };
      await writeJsonSetting(db, PROFILE_KEY, merged);

      if (currentWeightKg != null) {
        const today = new Date().toISOString().slice(0, 10);
        await upsertBodyweightLog(db, today, currentWeightKg);
      }

      return merged;
    },
  );

  // GET /api/settings/equipment — null (not []) until the user has actually set anything, so
  // the client can tell "never configured, don't filter" apart from "configured to own nothing".
  app.get("/api/settings/equipment", { schema: { response: { 200: equipmentResponse } } }, async () => {
    return { equipment: await readJsonSetting<string[]>(db, EQUIPMENT_KEY) };
  });

  app.put(
    "/api/settings/equipment",
    { schema: { body: equipmentInput, response: { 200: equipmentInput } } },
    async (req) => {
      await writeJsonSetting(db, EQUIPMENT_KEY, req.body.equipment);
      return req.body;
    },
  );

  // GET/PUT /api/settings/gym — bar weight + owned plate counts. Null until configured, same
  // "not yet set" vs "set to nothing" distinction as equipment above (plates.ts callers fall
  // back to the unlimited-standard-set calculator while this is null).
  app.get("/api/settings/gym", { schema: { response: { 200: gymSetupResponse } } }, async () => {
    return readJsonSetting<GymSetup>(db, GYM_KEY);
  });

  app.put("/api/settings/gym", { schema: { body: gymSetupInput, response: { 200: gymSetupInput } } }, async (req) => {
    await writeJsonSetting(db, GYM_KEY, req.body);
    return req.body;
  });
}
