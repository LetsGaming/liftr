<script setup lang="ts">
/**
 * Exercise detail — a routed page (was ExerciseInfoPanel.vue's SheetModal sheet). Same 4-tab
 * content (Über / Rang / Statistiken / Verlauf) verbatim, now reached via `/exercises/:slug`
 * instead of opened as a modal, so it gets a real URL, back-button semantics, and a cold
 * deep-link. Always defaults to the Über tab on open (never remembers the last-viewed tab) —
 * see ExerciseInfoPanel.vue's own history for why. History (Rang/Statistiken/Verlauf) is fetched
 * lazily on first switch to one of those tabs, not on mount, for the same reason.
 */
import { estimateE1rm, missingByTier, type EquipmentRequirement, type TieredRequirement } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import ExerciseDemo from "../components/exercise/ExerciseDemo.vue";
import ExerciseHistoryList from "../components/exercise/ExerciseHistoryList.vue";
import ExerciseIcon from "../components/exercise/ExerciseIcon.vue";
import ProgressChart from "../components/rank/ProgressChart.vue";
import RankProgress from "../components/rank/RankProgress.vue";
import BasePage from "../components/ui/BasePage.vue";
import MuscleFigure from "../components/ui/MuscleFigure.vue";
import StatTile from "../components/ui/StatTile.vue";
import { useExerciseHistoryCache } from "../composables/useExerciseHistoryCache";
import { useExerciseName } from "../composables/useExerciseName";
import { equipmentRequirementLabelDe } from "../lib/equipmentIcons";
import { useCatalogStore } from "../stores/catalogStore";
import { useRanksStore } from "../stores/ranksStore";
import { useSettingsStore } from "../stores/settingsStore";

const route = useRoute();
const slug = computed(() => route.params.slug as string);

const catalog = useCatalogStore();
onMounted(() => {
  // router.ts's beforeEnter already kicks catalog.load() off before this component mounts —
  // guarded here too (RecordsPage.vue's own onMounted/beforeEnter idiom) so a component that
  // outlives that one prefetch (e.g. Fast Refresh, or catalog already loaded from another route)
  // doesn't fire a second concurrent full-catalog fetch.
  if (!catalog.loaded) void catalog.load();
});

const exercise = computed(() => catalog.bySlug(slug.value));
const notFound = computed(() => catalog.loaded && !exercise.value);

const { exerciseName, exerciseHowTo } = useExerciseName();
const settingsStore = useSettingsStore();
const ranksStore = useRanksStore();
const { historyCache, toggleExpand } = useExerciseHistoryCache();

const pageTitle = computed(() => (exercise.value ? exerciseName(exercise.value.slug, exercise.value.name) : "Übung"));

type TabKey = "ueber" | "rang" | "statistiken" | "verlauf";
const TABS: { key: TabKey; label: string }[] = [
  { key: "ueber", label: "Über" },
  { key: "rang", label: "Rang" },
  { key: "statistiken", label: "Statistiken" },
  { key: "verlauf", label: "Verlauf" },
];
const activeTab = ref<TabKey>("ueber");

function selectTab(tab: TabKey) {
  activeTab.value = tab;
  if (tab === "ueber" || !exercise.value) return;
  // Lazy fetch, keyed by exercise id — first switch to any non-Über tab only (data-wiring
  // rule above). historyCache already de-dupes repeat switches; toggleExpand() also flips an
  // `expanded` flag this component doesn't use, but calling it is harmless.
  if (!historyCache.has(exercise.value.id)) void toggleExpand(exercise.value.id);
  if (tab === "rang" && !ranksStore.loaded) void ranksStore.load();
}

const historySets = computed(() => (exercise.value ? (historyCache.get(exercise.value.id) ?? []) : []));
const nonWarmupHistorySets = computed(() => historySets.value.filter((s) => !s.isWarmup));

const rankRow = computed(() => (exercise.value ? (ranksStore.ranks.find((r) => r.exerciseId === exercise.value!.id) ?? null) : null));

/** Best e1RM (loaded lifts) or best reps (bodyweight), matching ProgressChart.vue's own
 *  bodyweight-vs-loaded branch so the two never disagree about what "best" means. */
const bestStatLabel = computed(() => {
  if (!exercise.value || nonWarmupHistorySets.value.length === 0) return "–";
  if (exercise.value.isBodyweight) {
    const best = Math.max(...nonWarmupHistorySets.value.map((s) => s.reps));
    return `${best} Wdh.`;
  }
  let bestE1rm = 0;
  for (const s of nonWarmupHistorySets.value) {
    if (s.weightKg == null) continue;
    const { e1rm } = estimateE1rm(s.weightKg, s.reps);
    if (e1rm > bestE1rm) bestE1rm = e1rm;
  }
  return bestE1rm > 0 ? `${Math.round(bestE1rm)} kg` : "–";
});
const lifetimeVolumeKg = computed(() => nonWarmupHistorySets.value.reduce((sum, s) => sum + (s.weightKg ?? 0) * s.reps, 0));
const totalSetsLogged = computed(() => historySets.value.length);

const primary = computed(() => exercise.value?.muscles.filter((m) => m.role === "primary").map((m) => m.slug) ?? []);
const secondary = computed(() => exercise.value?.muscles.filter((m) => m.role === "secondary").map((m) => m.slug) ?? []);

// Falls back to just the primary `equipment` tag for a custom (user-created) exercise, which
// never gets a `requiredEquipment` value (the custom-exercise creation form only collects a
// single `equipment` string), so this section is never simply empty.
const requirements = computed<TieredRequirement[]>(() => {
  if (!exercise.value) return [];
  const list = exercise.value.requiredEquipment;
  if (list && list.length > 0) return list;
  return exercise.value.equipment ? [{ item: exercise.value.equipment as EquipmentRequirement, tier: "required" as const }] : [];
});
const ownedEquipment = computed(() => settingsStore.ownedEquipment);
// Only a `required` miss gets the hard red "fehlt" treatment here; recommended/optional misses
// get a softer "empfohlen"/"optional" note — informative, never alarming, since the exercise is
// still fully doable without them.
const missing = computed(() => missingByTier(requirements.value, ownedEquipment.value));
function missingBadge(req: TieredRequirement): string | null {
  if (!missing.value[req.tier].includes(req.item)) return null;
  if (req.tier === "required") return "fehlt";
  if (req.tier === "recommended") return "empfohlen";
  return "optional";
}
</script>

<template>
  <BasePage :title="pageTitle" back-button variant="drawer">
    <template v-if="exercise" #subheader>
      <div class="tab-strip" role="tablist">
        <button
          v-for="t in TABS"
          :key="t.key"
          role="tab"
          class="tab-pill"
          :class="{ active: activeTab === t.key }"
          :aria-selected="activeTab === t.key"
          @click="selectTab(t.key)"
        >
          {{ t.label }}
        </button>
      </div>
    </template>

    <div v-if="notFound" class="not-found">
      <p>Diese Übung wurde nicht gefunden.</p>
      <router-link to="/exercises" class="btn-secondary btn-block">Zu den Übungen →</router-link>
    </div>

    <template v-else-if="exercise">
      <div v-if="activeTab === 'ueber'">
        <ExerciseDemo :slug="exercise.slug" />

        <p v-if="exerciseHowTo(exercise.slug)" class="howto">{{ exerciseHowTo(exercise.slug) }}</p>

        <div v-if="requirements.length > 0" class="eyebrow equipment-eyebrow">Benötigtes Equipment</div>
        <div v-if="requirements.length > 0" class="equipment-list">
          <span
            v-for="req in requirements"
            :key="req.item"
            class="equipment-chip"
            :class="{ missing: missingBadge(req) === 'fehlt', soft: missingBadge(req) != null && missingBadge(req) !== 'fehlt' }"
          >
            <ExerciseIcon :equipment="req.item" :size="16" />
            {{ equipmentRequirementLabelDe(req.item) }}
            <span v-if="missingBadge(req)" class="missing-badge">{{ missingBadge(req) }}</span>
          </span>
        </div>

        <div class="eyebrow muscles-eyebrow">Trainierte Muskeln</div>
        <MuscleFigure :primary="primary" :secondary="secondary" />
        <div class="legend">
          <span><i class="pri" />Primär</span>
          <span><i class="sec" />Sekundär</span>
        </div>
      </div>

      <div v-else-if="activeTab === 'rang'">
        <div v-if="rankRow" class="rank-reward panel-reward" :class="`t-${rankRow.tier}`">
          <RankProgress
            variant="card"
            :tier="rankRow.tier"
            :division="rankRow.division"
            :lp="rankRow.lp"
            :next-target-weight-kg="rankRow.nextTargetWeightKg"
            :next-target-reps="rankRow.nextTargetReps"
            :trust="rankRow.trust"
          />
        </div>
        <p v-else-if="ranksStore.loaded" class="hint">
          Noch kein Rang — er entsteht aus deinem besten Satz, sobald du diese Übung einmal trainiert hast.
        </p>
        <p v-else class="hint">Lädt…</p>
      </div>

      <div v-else-if="activeTab === 'statistiken'">
        <ProgressChart class="wide-chart" :sets="historySets" :is-bodyweight="exercise.isBodyweight" />
        <div class="stat-row">
          <StatTile :value="bestStatLabel" label="Bestleistung" />
          <StatTile :value="`${Math.round(lifetimeVolumeKg).toLocaleString('de-DE')} kg`" label="Volumen" />
          <StatTile :value="totalSetsLogged" label="Sätze" />
        </div>
      </div>

      <div v-else-if="activeTab === 'verlauf'">
        <ExerciseHistoryList :sets="historySets" />
      </div>
    </template>
  </BasePage>
</template>

<style scoped>
.not-found {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp5) 0;
  color: var(--dim);
}
.hint {
  color: var(--dim);
  font-size: 13px;
}

/* The Rang tab's own hero readout — the one place <RankProgress variant="card"> still gets a
   full tier-fill background: this is a single reward moment in a tab panel, not a grid cell with
   its own tier-accent rim, so there's no card border to carry tier color instead. Reuses
   tokens.css's .panel-reward (the same recipe the app's other reward surfaces use) rather than a
   bespoke plaque. .panel-reward itself sets no padding (it's also used un-padded elsewhere), so
   it's added locally. */
.rank-reward {
  padding: var(--sp3) var(--sp4);
}
.wide-chart {
  width: 100%;
  margin-bottom: var(--sp4);
}
/* ProgressChart.vue's own scoped layout is a compact flex row (fixed 140px spark + inline
   latest-value label) sized for the Ränge grid's card slot. Full page width needs the spark to
   actually grow — stack chart-above-label instead of forcing the label to share a row it no
   longer fits. */
.wide-chart :deep(.progress-chart) {
  flex-direction: column;
  align-items: stretch;
  gap: var(--sp2);
}
.wide-chart :deep(.spark) {
  width: 100%;
  height: 64px;
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--sp2);
}
.howto {
  font-size: 13px;
  color: var(--dim);
  margin-top: var(--sp3);
  line-height: 1.5;
}
.equipment-eyebrow {
  margin: var(--sp5) 0 var(--sp2);
}
.equipment-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
.equipment-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 12.5px;
  font-weight: 600;
}
.equipment-chip.missing {
  border-color: var(--danger);
  background: var(--danger-lo);
}
.equipment-chip.missing .missing-badge {
  color: #ffd9db;
}
.equipment-chip.soft {
  border-style: dashed;
}
.equipment-chip.soft .missing-badge {
  color: var(--faint);
}
.missing-badge {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.muscles-eyebrow {
  margin: var(--sp5) 0 var(--sp3);
  text-align: center;
}
.legend {
  display: flex;
  gap: var(--sp4);
  justify-content: center;
  margin-top: var(--sp3);
  font-size: 11px;
  color: var(--dim);
}
.legend i {
  width: 10px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
  margin-right: 5px;
  vertical-align: -1px;
}
.legend .pri {
  background: var(--blue-hi);
}
.legend .sec {
  /* References the single --muscle-secondary token that .mm-sec also draws from, instead of a
     hardcoded color, so both stay in sync across themes. */
  background: var(--muscle-secondary);
}
</style>
