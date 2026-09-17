<script setup lang="ts">
/**
 * Lauf-Ränge: hero ladder + the fixed 5-category (mile/5k/10k/half_marathon/marathon) grid.
 * Extracted out of RanksPage.vue (which now just switches between this and
 * RankLifterSection.vue) — self-contained, no props, same pattern as RoutineList.vue.
 */
import { RUN_CATEGORIES, type RunCategory } from "@liftr/shared";
import { computed, onMounted } from "vue";
import CardGrid from "../ui/CardGrid.vue";
import RankProgress from "./RankProgress.vue";
import TierBadge from "./TierBadge.vue";
import TierLadder from "./TierLadder.vue";
import { useRunRankStore, type RunRankRow } from "../../stores/runRankStore";
import { formatPace } from "../../lib/format";

const runRankStore = useRunRankStore();
onMounted(() => {
  void runRankStore.loadRanks();
  void runRankStore.loadOverallRank();
});

// RUN_CATEGORIES is a fixed 5-entry list (mile/5k/10k/half_marathon/marathon), same fixed-row
// convention RecordsPage.vue's running section already uses — every category always renders,
// with an honest placeholder for one with no rank yet, rather than a variable-length list like
// the per-exercise strength grid.
const RUN_CATEGORY_LABEL: Record<RunCategory, string> = {
  mile: "Meile",
  "5k": "5 km",
  "10k": "10 km",
  half_marathon: "Halbmarathon",
  marathon: "Marathon",
};

const runRankByCategory = computed(() => {
  const out: Partial<Record<RunCategory, RunRankRow>> = {};
  for (const r of runRankStore.ranks) out[r.category as RunCategory] = r;
  return out;
});

/** RankProgress's built-in "next target" formatting assumes a weight×reps pair, which doesn't
 *  fit a running category's next target (a pace). Formatted here and passed through
 *  RankProgress's `nextTargetLabel` override instead of forking the component — see that prop's
 *  own comment. Uses lib/format.ts's shared formatPace (mm:ss/km), converting from the stored
 *  m/s speed the same way runRankService.ts's nextTargetSpeedMps is defined. */
function formatNextSpeedTarget(speedMps: number | null): string {
  if (speedMps == null) return "Nächstes Ziel: ???";
  return `Nächstes Ziel: ${formatPace(1000 / speedMps)}`;
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
      <!-- Not a ListCard: unlike the Kraft grid's cards, these don't do anything on tap (no
           expand, no navigation) — a real <button>/role="button" here would be a false
           affordance. Plain .card/.surface-hybrid (list-card.css), the same classes ListCard.vue
           itself renders, so the shell still matches exactly; only the click affordance differs. -->
      <div
        v-for="category in RUN_CATEGORIES"
        :key="category"
        class="card surface-hybrid"
        :class="runRankByCategory[category] ? `t-${runRankByCategory[category]!.tier}` : ''"
      >
        <div class="card-head">
          <b class="card-name">{{ RUN_CATEGORY_LABEL[category] }}</b>
          <TierBadge v-if="runRankByCategory[category]" :tier="runRankByCategory[category]!.tier" />
        </div>
        <RankProgress
          v-if="runRankByCategory[category]"
          variant="card"
          :badge="false"
          :tier="runRankByCategory[category]!.tier"
          :division="runRankByCategory[category]!.division"
          :lp="runRankByCategory[category]!.lp"
          :next-target-label="formatNextSpeedTarget(runRankByCategory[category]!.nextTargetSpeedMps)"
          :trust="runRankByCategory[category]!.trust ?? 'real'"
          :peak-tier="runRankByCategory[category]!.peakTier"
          :peak-division="runRankByCategory[category]!.peakDivision"
        />
        <p v-else class="run-rank-empty-note">Noch kein Rang — lauf diese Distanz, um zu starten.</p>
      </div>
    </CardGrid>
  </div>
</template>

<style scoped>
/* .page-note/.rank-skel-card/.load-error and the grid's self-centering are shared with
   RankLifterSection.vue and ExerciseInfoPanel.vue via the global styles/rank-card.css (loaded
   from main.ts); .card/.card-grid/.card-head/.card-name come from global list-card.css, same as
   every other card grid in the app — only this section's own empty-state note stays scoped
   here. */
.run-rank-empty-note {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
