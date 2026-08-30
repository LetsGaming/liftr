import type { Equipment } from "./equipment.js";

/**
 * Supporting props deliberately excluded from `Equipment` (equipment.ts: "never win a match" —
 * a bench isn't what "what equipment does this need" means for icon/filter purposes). They
 * matter for a different question this module answers instead: can the user *physically perform*
 * this exercise with what they own? Bench press tagged only `barbell` looks doable to someone
 * with a barbell and no bench — this vocabulary is what closes that gap.
 */
export type SupportEquipment = "bench" | "incline-bench" | "rack" | "pullup-bar" | "dip-bars" | "mat" | "box" | "plates";

export const SUPPORT_EQUIPMENT_SLUGS: SupportEquipment[] = [
  "plates",
  "bench",
  "incline-bench",
  "rack",
  "pullup-bar",
  "dip-bars",
  "box",
  "mat",
];

export type EquipmentRequirement = Equipment | SupportEquipment;

/**
 * Feature: "instead of taking all equipment for an exercise as required there should be tiers —
 * this would allow exercises that are only missing a mat to not be filtered out." `required`
 * blocks (canPerform below), `recommended`/`optional` never do — they're surfaced as a softer
 * hint in the UI (ExerciseInfoPanel.vue, ExerciseList.vue) instead.
 */
export type RequirementTier = "required" | "recommended" | "optional";

export interface TieredRequirement {
  item: EquipmentRequirement;
  tier: RequirementTier;
}

interface DeriveInput {
  slug: string;
  equipment: string | null;
  movementPattern: string;
}

const LOADED_BAR_EQUIPMENT = new Set(["barbell", "ez-bar", "trap-bar"]);

const TIER_RANK: Record<RequirementTier, number> = { optional: 0, recommended: 1, required: 2 };

/** Same item can get added at different tiers by different rules (unlikely today, but the map
 *  keeps the highest-stakes tier if it ever happens) — never silently downgrades a hard blocker
 *  to a soft hint. */
function addRequirement(map: Map<EquipmentRequirement, RequirementTier>, item: EquipmentRequirement, tier: RequirementTier) {
  const existing = map.get(item);
  if (!existing || TIER_RANK[tier] > TIER_RANK[existing]) map.set(item, tier);
}

/**
 * Rule-based full requirement list, derived from data already in the catalog rather than
 * hand-typed per exercise (curated.yaml's own stated goal: "map equipment to exercises without
 * manually adjusting the code every time"). A `requiresEquipment` override in curated.yaml wins
 * over this for the handful of cases these rules get wrong, and a joined wger exercise's own
 * multi-item equipment tags win over this too where available (see ingestCatalog.ts /
 * equipment.ts's mapWgerEquipmentToRequirement) — this is the fallback for everything else.
 *
 * `required` only for items the movement is essentially impossible without (a barbell bench
 * press cannot happen without a bench); `recommended` for items that make it meaningfully more
 * comfortable but not impossible (floor core work without a mat is still doable).
 */
export function deriveRequirements(entry: DeriveInput): TieredRequirement[] {
  const requirements = new Map<EquipmentRequirement, RequirementTier>();
  if (entry.equipment) addRequirement(requirements, entry.equipment as EquipmentRequirement, "required");

  const slug = entry.slug;
  const isBarbellFamily = entry.equipment != null && LOADED_BAR_EQUIPMENT.has(entry.equipment);
  if (isBarbellFamily) addRequirement(requirements, "plates", "required");

  // Lying/inclined/declined on a bench — the movement's defining constraint, not an accessory.
  if (/bench-press|skull-crusher|dumbbell-pullover|dumbbell-fly|concentration-curl/.test(slug)) {
    addRequirement(requirements, "bench", "required");
  }
  if (/^incline-|dumbbell-incline-/.test(slug)) addRequirement(requirements, "incline-bench", "required");
  if (/^decline-/.test(slug) && entry.equipment !== "bodyweight") addRequirement(requirements, "bench", "required");

  // Barbell un-racked overhead, not lifted from the floor.
  if (isBarbellFamily && (entry.movementPattern === "squat" || slug === "overhead-press" || slug === "push-press")) {
    addRequirement(requirements, "rack", "required");
  }

  // Dead-hang movements.
  if (/pullup|chinup|hanging-leg-raise/.test(slug)) addRequirement(requirements, "pullup-bar", "required");

  // Parallel-bar dip — ring-dip uses rings instead, already covered by `equipment`.
  if (slug === "dip") addRequirement(requirements, "dip-bars", "required");

  // Floor-based core/mobility work — doable on bare floor, a mat just makes it more comfortable.
  if (/^(crunch|situp|russian-twist|plank|side-plank|glute-bridge|ab-wheel-rollout)$/.test(slug)) {
    addRequirement(requirements, "mat", "recommended");
  }

  // Elevated-surface step work.
  if (/^step-up|box-/.test(slug)) addRequirement(requirements, "box", "required");

  return [...requirements.entries()].map(([item, tier]) => ({ item, tier }));
}

const ALWAYS_ALLOWED: EquipmentRequirement = "bodyweight";

/**
 * A barbell/ez-bar/trap-bar owner almost by definition has something to load onto it — asking
 * the onboarding equipment picker for a *separate* explicit "plates" tick (on top of "Barbell")
 * would be one more easy-to-forget chip that silently fails every barbell exercise's check for
 * a user who has plates but never ticked the box. The real gap this feature closes is missing
 * *support* items like a bench/rack, not this — so bar ownership implies plate ownership here,
 * and the picker never surfaces "plates" as its own selectable chip (equipmentIcons.ts).
 */
function withImpliedPlates(owned: Set<string>): Set<string> {
  if ([...owned].some((item) => LOADED_BAR_EQUIPMENT.has(item))) owned.add("plates");
  return owned;
}

/**
 * `owned` null/empty means "no restriction configured yet", matching the existing equipment
 * filter's semantics (routineSuggestionService.ts) — not "the user owns nothing". A bodyweight
 * exercise with no other requirements always passes regardless of what's owned. Returns what's
 * missing per tier so a caller can hard-block on `required` while only hinting at the rest.
 */
export function missingByTier(requirements: TieredRequirement[], owned: string[] | null | undefined): Record<RequirementTier, EquipmentRequirement[]> {
  const result: Record<RequirementTier, EquipmentRequirement[]> = { required: [], recommended: [], optional: [] };
  if (!owned || owned.length === 0) return result;
  const ownedSet = withImpliedPlates(new Set(owned));
  for (const { item, tier } of requirements) {
    if (item === ALWAYS_ALLOWED) continue;
    // A malformed entry (e.g. a stale pre-tier client cache with plain strings instead of
    // {item, tier} objects — see catalogStore.ts's CACHE_KEY versioning) shouldn't crash the
    // whole computation; skip it rather than index into `result` with an unexpected key.
    if (!result[tier]) continue;
    if (!ownedSet.has(item)) result[tier].push(item);
  }
  return result;
}

/** Whether the exercise is performable at all — only a `required` gap blocks; missing
 *  `recommended`/`optional` items never do. */
export function canPerform(requirements: TieredRequirement[], owned: string[] | null | undefined): boolean {
  return missingByTier(requirements, owned).required.length === 0;
}

/**
 * wger (wger.de/api/v2, CC-BY-SA 4.0) tags an exercise with its *full* equipment list (a bench
 * press might carry both "Barbell" and "Bench") — richer than the single-value `equipment`
 * column normalizeWgerEquipment (equipment.ts) collapses it to. This is the other half: mapping
 * each raw wger equipment name to a tiered requirement, so a joined exercise's requiredEquipment
 * can come from real per-exercise upstream data instead of deriveRequirements()'s slug/pattern
 * guessing (see ingestCatalog.ts). "Resistance band"/"Swiss Ball" have no equivalent in this
 * app's vocabulary and map to null rather than being force-fit onto the nearest category, same
 * philosophy as every other normalizer here.
 */
const WGER_REQUIREMENT_MAP: Record<string, TieredRequirement | null> = {
  barbell: { item: "barbell", tier: "required" },
  "sz-bar": { item: "ez-bar", tier: "required" },
  dumbbell: { item: "dumbbell", tier: "required" },
  kettlebell: { item: "kettlebell", tier: "required" },
  "cable machine": { item: "cable", tier: "required" },
  "none (bodyweight exercise)": { item: "bodyweight", tier: "required" },
  bench: { item: "bench", tier: "required" },
  "incline bench": { item: "incline-bench", tier: "required" },
  "pull-up bar": { item: "pullup-bar", tier: "required" },
  "gym mat": { item: "mat", tier: "recommended" },
  "resistance band": null,
  "swiss ball": null,
};

/**
 * `equipmentNames` is one exercise's *full* wger equipment tag list (not priority-collapsed).
 * Automatically folds in "plates" (required) alongside a barbell-family item, same as
 * deriveRequirements() above — wger doesn't have its own "plates" equipment tag (a barbell
 * implies something to load on it, not a separately tracked prop), so this keeps the two
 * requirement sources consistent instead of only the rule-based path remembering to add it.
 */
export function mapWgerEquipmentToRequirements(equipmentNames: string[]): TieredRequirement[] {
  const requirements = new Map<EquipmentRequirement, RequirementTier>();
  for (const name of equipmentNames) {
    const mapped = WGER_REQUIREMENT_MAP[name.trim().toLowerCase()];
    if (mapped) addRequirement(requirements, mapped.item, mapped.tier);
  }
  if ([...requirements.keys()].some((item) => LOADED_BAR_EQUIPMENT.has(item))) {
    addRequirement(requirements, "plates", "required");
  }
  return [...requirements.entries()].map(([item, tier]) => ({ item, tier }));
}
