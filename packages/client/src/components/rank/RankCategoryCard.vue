<script setup lang="ts">
/**
 * One Läufe-grid card: name + tier medal header, RankProgress body, or an empty-state note when
 * `row` is null. Extracted out of RankRunnerSection.vue, which used to inline this exact markup
 * twice (once per RUN_CATEGORIES, once per singleSpeedRanks) — same "one component, not two
 * drifting copies" reason RankFlipCard.vue exists for the Kraft grid.
 */
import type { RunRankRow } from "../../stores/runRankStore";
import RankProgress from "./RankProgress.vue";
import TierBadge from "./TierBadge.vue";

withDefaults(
  defineProps<{
    name: string;
    row: RunRankRow | null;
    nextTargetLabel?: string | null;
    /** Trust shown when `row.trust` is null — categories default to "real" (a real running
     *  standards table), single-speed activities (Gehen/Wandern) default to "synthetic". */
    trustFallback?: "real" | "derived" | "synthetic";
    emptyNote?: string;
  }>(),
  { nextTargetLabel: null, trustFallback: "real", emptyNote: "" },
);
</script>

<template>
  <!-- Not a ListCard: unlike the Kraft grid's cards, these don't do anything on tap (no expand,
       no navigation) — a real <button>/role="button" here would be a false affordance. Plain
       .card/.surface-hybrid (list-card.css), the same classes ListCard.vue itself renders, so the
       shell still matches exactly; only the click affordance differs. -->
  <div class="card surface-hybrid" :class="row ? `t-${row.tier}` : ''">
    <div class="card-head">
      <b class="card-name">{{ name }}</b>
      <TierBadge v-if="row" :tier="row.tier" />
    </div>
    <RankProgress
      v-if="row"
      variant="card"
      :badge="false"
      :tier="row.tier"
      :division="row.division"
      :lp="row.lp"
      :next-target-label="nextTargetLabel"
      :trust="row.trust ?? trustFallback"
      :peak-tier="row.peakTier"
      :peak-division="row.peakDivision"
    />
    <p v-else class="run-rank-empty-note">{{ emptyNote }}</p>
  </div>
</template>

<style scoped>
.run-rank-empty-note {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
