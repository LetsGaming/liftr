<script setup lang="ts">
/**
 * Lauf-Ränge: hero ladder (Overall Runner Rank) + the fixed 5-category running grid, plus one
 * card per single-speed cardio activity (Gehen, Wandern — each ranked on one "all" bucket, see
 * cardioActivities.ts). Extracted out of RanksPage.vue (which now just switches between this and
 * RankLifterSection.vue) — self-contained, no props, same pattern as RoutineList.vue.
 *
 * Walking/hiking don't count toward Overall Runner Rank (their standards are synthetic estimates,
 * not the physiologically cross-validated running table) — that exclusion is stated below the
 * grid rather than left for the user to infer from the hero ladder simply never moving.
 */
import { RUN_CATEGORIES, rankedCardioActivities, type RunCategory } from "@liftr/shared";
import { computed, onMounted } from "vue";
import CardGrid from "../ui/CardGrid.vue";
import RankCategoryCard from "./RankCategoryCard.vue";
import TierLadder from "./TierLadder.vue";
import { useRunRankStore, type RunRankRow } from "../../stores/runRankStore";
import { formatPace } from "../../lib/format";
import { ACTIVITY_LABEL, RUN_CATEGORY_LABEL } from "../../copy/runCopy";

const runRankStore = useRunRankStore();
onMounted(() => {
  void runRankStore.loadRanks();
  void runRankStore.loadOverallRank();
});

// RUN_CATEGORIES is a fixed 5-entry list (mile/5k/10k/half_marathon/marathon), same fixed-row
// convention RecordsPage.vue's running section already uses — every category always renders,
// with an honest placeholder for one with no rank yet, rather than a variable-length list like
// the per-exercise strength grid.
const runRankByCategory = computed(() => {
  const out: Partial<Record<RunCategory, RunRankRow>> = {};
  for (const r of runRankStore.ranks) {
    if (r.activityType === "run") out[r.category as RunCategory] = r;
  }
  return out;
});

/** Single-speed activities (today: walk, hike) — the ones with rank.mode !== "distance-ladder" in
 *  the shared registry — each get exactly one card, keyed by activity id rather than category
 *  ("all" isn't a distance, so it has nothing to head a card with). Only an activity that has
 *  actually produced a rank row renders a card at all, so a user who's never walked sees nothing
 *  extra here — same "only show a real option" rule OverviewPage's activity filter follows. */
const singleSpeedRanks = computed(() => {
  const singleSpeedIds = new Set<string>(
    rankedCardioActivities()
      .filter((a) => a.rank.mode === "single-speed")
      .map((a) => a.id),
  );
  return runRankStore.ranks.filter((r) => singleSpeedIds.has(r.activityType));
});

/** RankProgress's built-in "next target" formatting assumes a weight×reps pair, which doesn't
 *  fit a cardio bucket's next target (a pace). Formatted here and passed through
 *  RankProgress's `nextTargetLabel` override instead of forking the component — see that prop's
 *  own comment. No "Nächstes Ziel:" prefix here — RankProgress's own `.rp-next-label` caption
 *  already carries that, sitting beside whichever chip this label ends up as. Uses lib/format.ts's
 *  shared formatPace (mm:ss/km), converting from the stored m/s speed the same way
 *  runRankService.ts's nextTargetSpeedMps is defined. */
function formatNextSpeedTarget(speedMps: number | null): string {
  if (speedMps == null) return "???";
  return formatPace(1000 / speedMps);
}
</script>

<template>
  <div class="rank-runner-section">
    <TierLadder
      class="ranks-tier-ladder"
      :current-tier="runRankStore.overallCurrent?.tier ?? null"
      :current-division="runRankStore.overallCurrent?.division ?? null"
      :peak-tier="runRankStore.overallPeak?.tier ?? null"
      :peak-division="runRankStore.overallPeak?.division ?? null"
    />

    <template v-if="!runRankStore.ranksLoaded && !runRankStore.ranksError">
      <CardGrid aria-hidden="true">
        <div v-for="i in 5" :key="i" class="shimmer rank-skel-card surface-hybrid" />
      </CardGrid>
    </template>

    <p v-else-if="runRankStore.ranksError" class="page-note load-error run-rank-load-error" style="margin-top: var(--sp4)">
      Lauf-Ränge konnten nicht geladen werden.
      <button type="button" class="btn-secondary" @click="runRankStore.loadRanks()">Erneut versuchen</button>
    </p>

    <CardGrid v-else>
      <RankCategoryCard
        v-for="category in RUN_CATEGORIES"
        :key="category"
        :name="RUN_CATEGORY_LABEL[category]"
        :row="runRankByCategory[category] ?? null"
        :next-target-label="runRankByCategory[category] && formatNextSpeedTarget(runRankByCategory[category]!.nextTargetSpeedMps)"
        trust-fallback="real"
        empty-note="Noch kein Rang — lauf diese Distanz, um zu starten."
      />

      <RankCategoryCard
        v-for="row in singleSpeedRanks"
        :key="row.activityType"
        :name="ACTIVITY_LABEL[row.activityType] ?? row.activityType"
        :row="row"
        :next-target-label="formatNextSpeedTarget(row.nextTargetSpeedMps)"
        trust-fallback="synthetic"
      />
    </CardGrid>

    <p v-if="singleSpeedRanks.length > 0" class="page-note overall-exclusion-note">
      Gehen und Wandern zählen nicht in den Overall Runner Rank — sie haben ihre eigene Wertung.
    </p>
  </div>
</template>

<style scoped>
/* .page-note/.rank-skel-card/.load-error and the grid's self-centering are shared with
   RankLifterSection.vue and ExerciseInfoPanel.vue via the global styles/rank-card.css (loaded
   from main.ts); .card/.card-grid/.card-head/.card-name come from global list-card.css, same as
   every other card grid in the app — only this section's own empty-state note stays scoped
   here. */
.overall-exclusion-note {
  margin-top: var(--sp3);
  font-size: 12px;
  color: var(--faint);
}
</style>
