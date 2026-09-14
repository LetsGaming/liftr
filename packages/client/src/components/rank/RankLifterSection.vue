<script setup lang="ts">
/**
 * Kraft-Ränge: hero ladder, analytics (donut + calendar), tier filter, and the per-exercise card
 * grid. Extracted out of RanksPage.vue (which now just switches between this and
 * RankRunnerSection.vue) — self-contained, no props, same pattern as RoutineList.vue.
 */
import { ordinal, TIERS, type Tier } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { LP_EXPLAINER } from "../../copy/rankCopy";
import { TIER_LABEL_DE } from "../../lib/tierIcons";
import { useExerciseHistoryCache } from "../../composables/useExerciseHistoryCache";
import { useExerciseName } from "../../composables/useExerciseName";
import { useOverallRankStore } from "../../stores/overallRankStore";
import { useRanksStore } from "../../stores/ranksStore";
import CardGrid from "../ui/CardGrid.vue";
import InfoToggle from "../ui/InfoToggle.vue";
import ListCard from "../ui/ListCard.vue";
import ProgressChart from "./ProgressChart.vue";
import RankDistributionDonut from "./RankDistributionDonut.vue";
import RankProgress from "./RankProgress.vue";
import RankUpCalendar from "./RankUpCalendar.vue";
import TierLadder from "./TierLadder.vue";

const ranksStore = useRanksStore();
const overallRank = useOverallRankStore();
onMounted(() => {
  void ranksStore.load();
  void overallRank.load();
});

const { exerciseName } = useExerciseName();
const { expanded, historyCache, toggleExpand } = useExerciseHistoryCache();

/** Sorted by LP descending so the exercise closest to a rank-up surfaces first, rather than
 *  falling wherever it lands alphabetically or by load-date. LP already *is* "how close to the
 *  next rank-up" (0-100 within the current band, see rankService.ts), so this turns the grid
 *  from a wall of cards into "what to train next" using the existing signal as reading order.
 *  Higher tier/division breaks ties so two exercises at the same LP don't shuffle on reload. */
const sortedRanks = computed(() =>
  ranksStore.ranks
    .slice()
    .sort((a, b) => b.lp - a.lp || ordinal(b.tier as Tier, b.division) - ordinal(a.tier as Tier, a.division)),
);

/** Tier filter — a flat "all ranks" list gets unwieldy once someone has trained a real number of
 *  exercises (the seeded mock data only has 8, but a real gym history can easily have 30-40).
 *  Tier is the one grouping already on every RankRow with no extra store/join needed (a
 *  muscle-group filter would need catalogStore's per-exercise muscle data, which ranksStore
 *  doesn't carry). Only tiers the user actually has a rank in render as options — same "every
 *  option is real" rule OverviewPage's own tab-strip filter follows. */
const tierFilter = ref<"alle" | Tier>("alle");
const presentTiers = computed(() => {
  const present = new Set(sortedRanks.value.map((r) => r.tier as Tier));
  return TIERS.filter((t) => present.has(t)).reverse(); // highest tier first, matching the LP-desc reading order
});
const filteredRanks = computed(() =>
  tierFilter.value === "alle" ? sortedRanks.value : sortedRanks.value.filter((r) => r.tier === tierFilter.value),
);
</script>

<template>
  <div class="rank-lifter-section">
    <TierLadder
      class="ranks-tier-ladder"
      :current-tier="overallRank.current?.tier ?? null"
      :current-division="overallRank.current?.division ?? null"
      :peak-tier="overallRank.peak?.tier ?? null"
      :peak-division="overallRank.peak?.division ?? null"
    />

    <InfoToggle label="Pro Übung · echte Standards wo verfügbar, sonst abgeleitet — nichts gesperrt">
      <b class="tnum">LP</b> {{ LP_EXPLAINER }}. Ein
      <b>≈</b> markiert einen abgeleiteten oder geschätzten Standard statt eines echten Maximaltests —
      dein Rang bleibt trotzdem gültig, nur die Grundlage ist weniger exakt.
    </InfoToggle>
    <template v-if="!ranksStore.loaded && !ranksStore.error">
      <div class="rank-analytics" aria-hidden="true">
        <div class="rank-skel-tile surface-hybrid"><div class="shimmer rank-skel-block" /></div>
        <div class="rank-skel-tile surface-hybrid"><div class="shimmer rank-skel-block" /></div>
      </div>
      <CardGrid>
        <div v-for="i in 4" :key="i" class="shimmer rank-skel-card surface-hybrid" aria-hidden="true" />
      </CardGrid>
    </template>

    <p v-else-if="ranksStore.error" class="page-note load-error" style="margin-top: var(--sp4)">
      Ränge konnten nicht geladen werden. Was du geloggt hast, ist lokal gespeichert.
      <button type="button" class="btn-secondary" @click="ranksStore.load()">Erneut versuchen</button>
    </p>

    <template v-else>
      <p v-if="ranksStore.ranks.length === 0" class="page-note" style="margin-top: var(--sp4)">
        Dein erster Rang entsteht, sobald du eine Übung geloggt hast.
      </p>

      <div v-else class="rank-analytics">
        <RankDistributionDonut />
        <RankUpCalendar />
      </div>

      <div v-if="presentTiers.length > 1" class="tab-strip rank-tier-filter" role="tablist" aria-label="Nach Rang filtern">
        <button
          role="tab"
          class="tab-pill"
          :class="{ active: tierFilter === 'alle' }"
          :aria-selected="tierFilter === 'alle'"
          @click="tierFilter = 'alle'"
        >
          Alle
        </button>
        <button
          v-for="t in presentTiers"
          :key="t"
          role="tab"
          class="tab-pill"
          :class="{ active: tierFilter === t }"
          :aria-selected="tierFilter === t"
          @click="tierFilter = t"
        >
          {{ TIER_LABEL_DE[t] }}
        </button>
      </div>

      <CardGrid v-if="ranksStore.ranks.length > 0">
        <ListCard
          v-for="r in filteredRanks"
          :key="r.exerciseId"
          :class="`t-${r.tier}`"
          :title="exerciseName(r.slug, r.name)"
          @open="toggleExpand(r.exerciseId)"
        >
          <div class="rank-tier-frame" :class="`t-${r.tier}`">
            <RankProgress
              variant="card"
              :tier="r.tier"
              :division="r.division"
              :lp="r.lp"
              :next-target-weight-kg="r.nextTargetWeightKg"
              :next-target-reps="r.nextTargetReps"
              :trust="r.trust"
              :peak-tier="r.peakTier"
              :peak-division="r.peakDivision"
            />
          </div>
          <template v-if="expanded.has(r.exerciseId)" #footer>
            <div class="chart-slot pop-in" @click.stop>
              <ProgressChart v-if="historyCache.has(r.exerciseId)" :sets="historyCache.get(r.exerciseId)!" :is-bodyweight="r.isBodyweight" />
            </div>
          </template>
        </ListCard>
      </CardGrid>
    </template>
  </div>
</template>

<style scoped>
/* .page-note/.rank-tier-frame/.rank-skel-card/.load-error and the .ranks-tier-ladder :deep()
   overrides are shared with RankRunnerSection.vue and ExerciseInfoPanel.vue via the global
   styles/rank-card.css (loaded from main.ts); the grid/card shell itself comes from
   CardGrid.vue/ListCard.vue + global list-card.css, same as every other card grid in the app
   (RoutineList.vue/RouteList.vue) — only this section's own unique pieces (analytics tiles, tier
   filter, chart-expand panel) stay scoped here. */
.rank-analytics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp4);
  margin: var(--sp4) auto 0;
  max-width: var(--content-w-wide);
}
.rank-tier-filter {
  margin: var(--sp4) auto 0;
  max-width: var(--content-w-wide);
}
/* list-card.css's `.card-grid` is sized (width:100%, max-width capped) but not self-centering —
   CardListScreen.vue normally centers it via flex `align-items: center` at desktop widths, but
   this section has other content (ladder, analytics, filter) stacked above the grid so it isn't
   wrapped in that screen shell. Same `margin: auto` self-centering as `.rank-analytics`/
   `.rank-tier-filter` above instead. Scoped selectors on a child component's own root element
   still apply (Vue's documented "leaks into child root" behavior for single-root components used
   directly in this template), so this reaches CardGrid.vue's rendered `.card-grid` div. */
.card-grid {
  margin: var(--sp4) auto 0;
}
/* Skeleton pieces — .shimmer (styles/motion.css) supplies the sweep; `.surface-hybrid`
   (tokens.css) puts a loading Ränge screen on the same translucent/hairline system as the loaded
   content it stands in for, rather than reverting to flat --surface-2 while data is in flight.
   `.surface-hybrid` supplies background/blur/shadow + the ::after hairline; border-radius/sizing
   stay local since the utility deliberately doesn't set border-radius (it needs to work on
   differently-shaped hosts). */
.rank-skel-tile {
  padding: var(--sp4);
  border-radius: var(--r-lg);
  min-height: 140px;
  display: flex;
  align-items: center;
}
.rank-skel-block {
  width: 100%;
  height: 90px;
  border-radius: var(--r-md);
  background-color: var(--surface-3);
}
/* The expand-on-click chart now lives in ListCard's own #footer slot (same slot RoutineList.vue's
   mesocycle inline form uses), so it's just another stacked block inside the card's existing
   padding/gap — no seam-fusion trick needed the way the old free-floating sibling panel needed
   one. `@click.stop` on the wrapper in the template keeps a tap inside the chart from re-toggling
   the card's own open/close (ListCard's root click handler covers the whole card). */
.chart-slot {
  padding-top: var(--sp2);
  border-top: 1px solid var(--line);
}
</style>
