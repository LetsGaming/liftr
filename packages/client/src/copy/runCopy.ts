/** Canonical German labels for cardio ranks — was hand-duplicated three times
 *  (RankRunnerSection.vue, RunDetail.vue, RecordsPage.vue), same "shared copy module" pattern as
 *  rankCopy.ts's LP_EXPLAINER. */
import type { RankBucket } from "@liftr/shared";

/** The five running distance categories. "all" (walking/hiking's single bucket) has no distance
 *  to name, so it isn't a "category" label at all — see ACTIVITY_LABEL below for how a
 *  single-speed activity names its one rank card instead. */
export const RUN_CATEGORY_LABEL: Record<Exclude<RankBucket, "all">, string> = {
  mile: "Meile",
  "5k": "5 km",
  "10k": "10 km",
  half_marathon: "Halbmarathon",
  marathon: "Marathon",
};

/** Display name for a cardio activity type, used wherever a run/walk/hike/other row needs to say
 *  what it is (OverviewPage's history feed, RunDetail's rank chip, RecordsPage). */
export const ACTIVITY_LABEL: Record<string, string> = {
  run: "Laufen",
  walk: "Gehen",
  hike: "Wandern",
  other: "Sonstiges",
};

/** A rank bucket's display label for a given activity: the running distance name for "run", or
 *  the activity's own name for a single-speed activity's "all" bucket (there's no distance to
 *  show — "Gehen", not "Gehen (all)"). */
export function rankBucketLabel(activityType: string, bucket: RankBucket): string {
  if (bucket === "all") return ACTIVITY_LABEL[activityType] ?? activityType;
  return RUN_CATEGORY_LABEL[bucket];
}
