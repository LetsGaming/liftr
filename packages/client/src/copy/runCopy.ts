/** Canonical labels for cardio ranks — was hand-duplicated three times
 *  (RankRunnerSection.vue, RunDetail.vue, RecordsPage.vue), same "shared copy module" pattern as
 *  rankCopy.ts's lpExplainer(). */
import type { RankBucket } from "@liftr/shared";
import { t } from "../i18n";

/** Keys into `runCopy.category.*` for the five running distance categories. "all" (walking/
 *  hiking's single bucket) has no distance to name, so it isn't a "category" label at all — see
 *  activityLabel() below for how a single-speed activity names its one rank card instead. */
const RUN_CATEGORY_LABEL_KEY: Record<Exclude<RankBucket, "all">, string> = {
  mile: "runCopy.category.mile",
  "5k": "runCopy.category.5k",
  "10k": "runCopy.category.10k",
  half_marathon: "runCopy.category.half_marathon",
  marathon: "runCopy.category.marathon",
};

/** Keys into `runCopy.activity.*`, used wherever a run/walk/hike/other row needs to say what it
 *  is (OverviewPage's history feed, RunDetail's rank chip, RecordsPage). */
const ACTIVITY_LABEL_KEY: Record<string, string> = {
  run: "runCopy.activity.run",
  walk: "runCopy.activity.walk",
  hike: "runCopy.activity.hike",
  other: "runCopy.activity.other",
};

export function runCategoryLabel(bucket: Exclude<RankBucket, "all">): string {
  return t(RUN_CATEGORY_LABEL_KEY[bucket]);
}

export function activityLabel(activityType: string): string {
  const key = ACTIVITY_LABEL_KEY[activityType];
  return key ? t(key) : activityType;
}

/** A rank bucket's display label for a given activity: the running distance name for "run", or
 *  the activity's own name for a single-speed activity's "all" bucket (there's no distance to
 *  show — "Gehen", not "Gehen (all)"). */
export function rankBucketLabel(activityType: string, bucket: RankBucket): string {
  if (bucket === "all") return activityLabel(activityType);
  return runCategoryLabel(bucket);
}
