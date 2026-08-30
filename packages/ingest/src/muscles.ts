/**
 * Muscle taxonomy — adopted wholesale from wger's public API (`GET /api/v2/muscle/`), which
 * itself maps 1:1 onto the 15 individually-shaped highlight overlays mirrored by
 * `ingestMuscleAssets.ts`. Deliberately not our own invented list: using wger's own 15 muscles
 * means every tag here has a real, precisely-shaped highlight on the anatomical figure instead
 * of an approximate hand-drawn region. `wgerMuscleId` is the join key into the mirrored
 * `data/images/muscles/{main,secondary}/muscle-<id>.svg` files.
 */
export interface MuscleSeed {
  slug: string;
  svgRegionKey: string; // stores the wger muscle id as a string — the join key for asset lookup
  wgerMuscleId: number;
  isFront: boolean;
}

export const MUSCLES: MuscleSeed[] = [
  { slug: "biceps", svgRegionKey: "1", wgerMuscleId: 1, isFront: true },
  { slug: "front-delts", svgRegionKey: "2", wgerMuscleId: 2, isFront: true },
  { slug: "serratus", svgRegionKey: "3", wgerMuscleId: 3, isFront: true },
  { slug: "chest", svgRegionKey: "4", wgerMuscleId: 4, isFront: true },
  { slug: "triceps", svgRegionKey: "5", wgerMuscleId: 5, isFront: false },
  { slug: "abs", svgRegionKey: "6", wgerMuscleId: 6, isFront: true },
  { slug: "calves", svgRegionKey: "7", wgerMuscleId: 7, isFront: false },
  { slug: "glutes", svgRegionKey: "8", wgerMuscleId: 8, isFront: false },
  { slug: "traps", svgRegionKey: "9", wgerMuscleId: 9, isFront: false },
  { slug: "quads", svgRegionKey: "10", wgerMuscleId: 10, isFront: true },
  { slug: "hamstrings", svgRegionKey: "11", wgerMuscleId: 11, isFront: false },
  { slug: "lats", svgRegionKey: "12", wgerMuscleId: 12, isFront: false },
  { slug: "brachialis", svgRegionKey: "13", wgerMuscleId: 13, isFront: true },
  { slug: "obliques", svgRegionKey: "14", wgerMuscleId: 14, isFront: true },
  { slug: "soleus", svgRegionKey: "15", wgerMuscleId: 15, isFront: false },
];
