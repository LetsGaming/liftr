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
import { computed, onMounted, ref } from "vue";
import CardGrid from "../ui/CardGrid.vue";
import RankCategoryCard from "./RankCategoryCard.vue";
import TierLadder from "./TierLadder.vue";
import { useRunRankStore, type RunPrListItem, type RunRankRow } from "../../stores/runRankStore";
import { formatClockLong, formatPace } from "../../lib/format";
import { ACTIVITY_LABEL, RUN_CATEGORY_LABEL } from "../../copy/runCopy";

const runRankStore = useRunRankStore();
onMounted(() => {
  void runRankStore.loadRanks();
  void runRankStore.loadOverallRank();
  void runRankStore.loadPrs();
});

/** One card flipped at a time, same accordion rule RankLifterSection.vue's Kraft grid already
 *  follows (see that file's own comment on `flipped`/`activatedBacks`) — kept here rather than in
 *  RankCategoryCard.vue itself so both grids share the exact same interaction, not two similar-
 *  but-independent implementations. Keyed by category for the RUN_CATEGORIES loop below (stable
 *  even before a rank row exists) and by activityType for the single-speed loop (always has a
 *  row, since only a real rank ever renders a card there). */
const flipped = ref<string | null>(null);
const activatedBacks = ref(new Set<string>());
function toggleFlip(id: string) {
  if (flipped.value !== id) activatedBacks.value.add(id);
  flipped.value = flipped.value === id ? null : id;
}

/** The current personal best per running category (fastest "time" PR) — RecordsPage.vue's own
 *  cardio-records section does this exact reduction for the exact same reason: run_prs keeps
 *  every historical PR event, not just the current best, so "current best" is an application-
 *  level reduction over runRankStore.prs rather than something the API hands back pre-reduced. */
const bestRunTimeByCategory = computed(() => {
  const out: Partial<Record<RunCategory, RunPrListItem>> = {};
  for (const pr of runRankStore.prs) {
    if (pr.activityType !== "run" || pr.kind !== "time") continue;
    const current = out[pr.category as RunCategory];
    if (!current || pr.value < current.value) out[pr.category as RunCategory] = pr;
  }
  return out;
});

/** Single-speed activities (walk/hike) have no "time" PR — no fixed distance to divide by — so
 *  their personal best is the fastest (highest-value) "speed" PR instead, same convention
 *  RecordsPage.vue's own bestSpeedByActivity follows. */
const bestSpeedByActivity = computed(() => {
  const out: Record<string, RunPrListItem> = {};
  for (const pr of runRankStore.prs) {
    if (pr.activityType === "run" || pr.kind !== "speed") continue;
    const current = out[pr.activityType];
    if (!current || pr.value > current.value) out[pr.activityType] = pr;
  }
  return out;
});

function formatPrDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

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
        :flipped="flipped === category"
        :back-activated="activatedBacks.has(category)"
        :pr-label="bestRunTimeByCategory[category] ? formatClockLong(bestRunTimeByCategory[category]!.value) : null"
        :pr-date="bestRunTimeByCategory[category] ? formatPrDate(bestRunTimeByCategory[category]!.achievedAt) : null"
        @flip="toggleFlip(category)"
      />

      <RankCategoryCard
        v-for="row in singleSpeedRanks"
        :key="row.activityType"
        :name="ACTIVITY_LABEL[row.activityType] ?? row.activityType"
        :row="row"
        :next-target-label="formatNextSpeedTarget(row.nextTargetSpeedMps)"
        trust-fallback="synthetic"
        :flipped="flipped === row.activityType"
        :back-activated="activatedBacks.has(row.activityType)"
        :pr-label="bestSpeedByActivity[row.activityType] ? formatPace(1000 / bestSpeedByActivity[row.activityType]!.value) : null"
        :pr-date="bestSpeedByActivity[row.activityType] ? formatPrDate(bestSpeedByActivity[row.activityType]!.achievedAt) : null"
        @flip="toggleFlip(row.activityType)"
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
