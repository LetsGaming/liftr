<script setup lang="ts">
/**
 * Kraft-Ränge: hero ladder, analytics (donut + calendar), tier filter, and the per-exercise card
 * grid. Extracted out of RanksPage.vue (which now just switches between this and
 * RankRunnerSection.vue) — self-contained, no props, same pattern as RoutineList.vue.
 */
import { ordinal, TIERS, type Tier } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { lpExplainer } from "../../copy/rankCopy";
import { tierLabel } from "../../lib/tierIcons";
import { useExerciseName } from "../../composables/useExerciseName";
import { useCatalogStore } from "../../stores/catalogStore";
import { useOverallRankStore } from "../../stores/overallRankStore";
import { useRanksStore, type RankRow } from "../../stores/ranksStore";
import CardGrid from "../patterns/CardGrid.vue";
import InfoToggle from "../patterns/InfoToggle.vue";
import RankDistributionDonut from "./RankDistributionDonut.vue";
import RankExerciseBack from "./RankExerciseBack.vue";
import RankFlipCard from "./RankFlipCard.vue";
import RankProgress from "./RankProgress.vue";
import RankUpCalendar from "./RankUpCalendar.vue";
import TierLadder from "./TierLadder.vue";
import Button from "../base/Button.vue";

const { t } = useI18n();
const router = useRouter();
const ranksStore = useRanksStore();
const overallRank = useOverallRankStore();
const catalog = useCatalogStore();
onMounted(() => {
  void ranksStore.load();
  void overallRank.load();
  void catalog.load();
});

const { exerciseName } = useExerciseName();

/** One card flipped at a time (same accordion rule TierLadder.vue's division-expand already
 *  follows) — flipping shows RankExerciseBack.vue's per-exercise rank + trained muscles on the
 *  back, a real CSS 3D flip (see the template/style below), replacing both the old per-card e1RM
 *  chart-expand AND, more recently, a height-jumping v-if/v-else content swap that only *looked*
 *  like a flip (no rotateY/backface-visibility at all) and — the actual bug report — showed the
 *  account's overall rank on every card's back instead of that card's own exercise.
 *
 *  `activatedBacks` lazily mounts each card's back face on its FIRST flip rather than always (a
 *  RankExerciseBack renders a MuscleFigure, i.e. several <img> requests — pre-mounting all of them
 *  for a 30-40-exercise grid, per this file's own comment on sortedRanks below, would cost real
 *  load time nobody asked for) and then keeps it mounted via v-show from then on, so every flip
 *  AFTER the first is a pure transform with zero remount/reflow — only the very first flip of a
 *  given card can cost a one-time layout settle while its back face mounts. */
const flipped = ref<string | null>(null);
const activatedBacks = ref(new Set<string>());
function toggleFlip(exerciseId: string) {
  if (flipped.value !== exerciseId) activatedBacks.value.add(exerciseId);
  flipped.value = flipped.value === exerciseId ? null : exerciseId;
}

function primaryMusclesFor(r: RankRow): string[] {
  return catalog.byId(r.exerciseId)?.muscles?.filter((m) => m.role === "primary").map((m) => m.slug) ?? [];
}
function secondaryMusclesFor(r: RankRow): string[] {
  return catalog.byId(r.exerciseId)?.muscles?.filter((m) => m.role === "secondary").map((m) => m.slug) ?? [];
}

function openStats(r: RankRow) {
  const exercise = catalog.byId(r.exerciseId);
  if (exercise) void router.push(`/exercises/${exercise.slug}`);
}

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
  return TIERS.filter((tier) => present.has(tier)).reverse(); // highest tier first, matching the LP-desc reading order
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

    <InfoToggle :label="t('rank.lifterSection.infoLabel')">
      <b class="tnum">LP</b> {{ lpExplainer() }}{{ t("rank.lifterSection.infoBodyLead") }}
      <b>≈</b>{{ t("rank.lifterSection.infoBodyTail") }}
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
      {{ t("rank.lifterSection.loadError") }}
      <Button variant="secondary" @click="ranksStore.load()">{{ t("rank.lifterSection.retry") }}</Button>
    </p>

    <template v-else>
      <p v-if="ranksStore.ranks.length === 0" class="page-note" style="margin-top: var(--sp4)">
        {{ t("rank.lifterSection.empty") }}
      </p>

      <div v-else class="rank-analytics">
        <RankDistributionDonut />
        <RankUpCalendar />
      </div>

      <div v-if="presentTiers.length > 1" class="rank-tier-filter">
        <button type="button" class="tab-pill tab-pill-sm" :class="{ active: tierFilter === 'alle' }" @click="tierFilter = 'alle'">
          {{ t("rank.lifterSection.filterAll") }}
        </button>
        <!-- A flat pill row stopped scaling once someone has trained enough exercises to span
             more than 2 tiers (9-tier system, TierLadder.vue) — a select collapses the long tail
             into one control instead of a pill row wrapping across multiple lines. -->
        <select
          v-if="presentTiers.length > 2"
          class="rank-tier-select"
          :aria-label="t('rank.lifterSection.filterAriaLabel')"
          :value="tierFilter === 'alle' ? '' : tierFilter"
          @change="tierFilter = (($event.target as HTMLSelectElement).value || 'alle') as 'alle' | Tier"
        >
          <option value="">{{ t("rank.lifterSection.filterPlaceholder") }}</option>
          <option v-for="tier in presentTiers" :key="tier" :value="tier">{{ tierLabel(tier) }}</option>
        </select>
        <button
          v-for="tier in presentTiers.length <= 2 ? presentTiers : []"
          :key="tier"
          type="button"
          class="tab-pill tab-pill-sm"
          :class="{ active: tierFilter === tier }"
          @click="tierFilter = tier"
        >
          {{ tierLabel(tier) }}
        </button>
      </div>

      <CardGrid v-if="ranksStore.ranks.length > 0">
        <RankFlipCard
          v-for="r in filteredRanks"
          :key="r.exerciseId"
          :tier="r.tier"
          :name="exerciseName(r.slug, r.name)"
          :flipped="flipped === r.exerciseId"
          :back-activated="activatedBacks.has(r.exerciseId)"
          @flip="toggleFlip(r.exerciseId)"
        >
          <template #front>
            <RankProgress
              variant="hero"
              :tier="r.tier"
              :division="r.division"
              :lp="r.lp"
              :next-target-weight-kg="r.nextTargetWeightKg"
              :next-target-reps="r.nextTargetReps"
              :trust="r.trust"
              :peak-tier="r.peakTier"
              :peak-division="r.peakDivision"
            />
          </template>
          <template #back>
            <RankExerciseBack
              :tier="r.tier"
              :division="r.division"
              :lp="r.lp"
              :peak-tier="r.peakTier"
              :peak-division="r.peakDivision"
              :primary-muscles="primaryMusclesFor(r)"
              :secondary-muscles="secondaryMusclesFor(r)"
              @stats="openStats(r)"
            />
          </template>
        </RankFlipCard>
      </CardGrid>
    </template>
  </div>
</template>

<style scoped>
/* .page-note/.rank-skel-card/.load-error are shared with RankRunnerSection.vue and
   ExerciseInfoPanel.vue via the global styles/rank-card.css (loaded from main.ts); the grid/card
   shell itself comes from CardGrid.vue/ListCard.vue + global list-card.css, same as every other
   card grid in the app (RoutineList.vue/RouteList.vue) — including the grid's own self-centering
   (also in rank-card.css, shared with RankRunnerSection.vue's identical rule) — only this
   section's own unique pieces (analytics tiles, tier filter) stay scoped here. */
.rank-analytics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: var(--sp4);
  margin: var(--sp4) auto 0;
  max-width: var(--content-w-wide);
}
/* .rank-tier-filter/.tab-pill-sm/.rank-tier-select moved to tokens.css (global) — OverviewPage.vue
   now uses the same secondary-filter pattern for its activity-type filter. */
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
</style>
