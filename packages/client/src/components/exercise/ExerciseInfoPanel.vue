<script setup lang="ts">
/**
 * Exercise info slide-over/bottom sheet (plan Phase 3.2, mockup's #dInfo / #mSheet). Opening
 * this must never leave the workout screen — it's a sheet layered on top, not a navigation.
 * Built on the shared SheetModal.vue (IonModal + header + close button), which this component
 * and WorkoutDetail.vue used to duplicate independently.
 *
 * Engagement rework W7: grew from a single scrolling body into a 4-tab sheet (Über / Rang /
 * Statistiken / Verlauf) — the tab strip + close button live in SheetModal's `#header` slot so
 * they stay pinned while each tab's content scrolls independently in the body below. Always
 * defaults to the Über tab on open (never remembers the last-viewed tab, per plan) — this sheet
 * is opened mid-set from the workout screen, and the how-to/muscle info is the common case;
 * anything that made getting back to it cost a tap would be a regression. History (used by the
 * Rang/Statistiken/Verlauf tabs) is fetched lazily on first switch to one of those tabs, not on
 * mount, for the same reason — the common "just check the how-to" open shouldn't cost a request.
 */
import { estimateE1rm, missingByTier, type EquipmentRequirement, type TieredRequirement } from "@liftr/shared";
import { computed, ref } from "vue";
import type { CatalogExercise } from "../../stores/catalogStore";
import { useExerciseHistoryCache } from "../../composables/useExerciseHistoryCache";
import { useExerciseName } from "../../composables/useExerciseName";
import { equipmentRequirementLabelDe } from "../../lib/equipmentIcons";
import { useRanksStore } from "../../stores/ranksStore";
import { useSettingsStore } from "../../stores/settingsStore";
import ProgressChart from "../rank/ProgressChart.vue";
import RankProgress from "../rank/RankProgress.vue";
import StatTile from "../ui/StatTile.vue";
import ExerciseDemo from "./ExerciseDemo.vue";
import ExerciseHistoryList from "./ExerciseHistoryList.vue";
import ExerciseIcon from "./ExerciseIcon.vue";
import MuscleFigure from "../ui/MuscleFigure.vue";
import SheetModal from "../ui/SheetModal.vue";

const props = defineProps<{ exercise: CatalogExercise }>();
const emit = defineEmits<{ close: [] }>();

const { exerciseName, exerciseHowTo } = useExerciseName();
const settingsStore = useSettingsStore();
const ranksStore = useRanksStore();
const { historyCache, toggleExpand } = useExerciseHistoryCache();

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
  if (tab === "ueber") return;
  // Lazy fetch, keyed by exercise id — first switch to any non-Über tab only (data-wiring
  // rule above). historyCache already de-dupes repeat switches; toggleExpand() also flips an
  // `expanded` flag this component doesn't use, but calling it is harmless.
  if (!historyCache.has(props.exercise.id)) void toggleExpand(props.exercise.id);
  if (tab === "rang" && !ranksStore.loaded) void ranksStore.load();
}

const historySets = computed(() => historyCache.get(props.exercise.id) ?? []);
const nonWarmupHistorySets = computed(() => historySets.value.filter((s) => !s.isWarmup));

const rankRow = computed(() => ranksStore.ranks.find((r) => r.exerciseId === props.exercise.id) ?? null);

/** Best e1RM (loaded lifts) or best reps (bodyweight), matching ProgressChart.vue's own
 *  bodyweight-vs-loaded branch so the two never disagree about what "best" means. */
const bestStatLabel = computed(() => {
  if (nonWarmupHistorySets.value.length === 0) return "–";
  if (props.exercise.isBodyweight) {
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

const primary = props.exercise.muscles.filter((m) => m.role === "primary").map((m) => m.slug);
const secondary = props.exercise.muscles.filter((m) => m.role === "secondary").map((m) => m.slug);

// Feature: "the Exercise info should show the used equipment" — falls back to just the primary
// `equipment` tag for a legacy/custom row with no requiredEquipment set yet, so this section is
// never simply empty.
const requirements = computed<TieredRequirement[]>(() => {
  const list = props.exercise.requiredEquipment;
  if (list && list.length > 0) return list;
  return props.exercise.equipment ? [{ item: props.exercise.equipment as EquipmentRequirement, tier: "required" as const }] : [];
});
const ownedEquipment = computed(() => settingsStore.ownedEquipment);
// Feature: "there should be tiers to it (required, recommended, optional) — this would allow
// exercises that only miss a mat to not be filtered out." Only a `required` miss gets the hard
// red "fehlt" treatment here; recommended/optional misses get a softer "empfohlen"/"optional"
// note — informative, never alarming, since the exercise is still fully doable without them.
const missing = computed(() => missingByTier(requirements.value, ownedEquipment.value));
function missingBadge(req: TieredRequirement): string | null {
  if (!missing.value[req.tier].includes(req.item)) return null;
  if (req.tier === "required") return "fehlt";
  if (req.tier === "recommended") return "empfohlen";
  return "optional";
}
</script>

<template>
  <SheetModal
    desktop-variant="drawer"
    desktop-width="480px"
    @close="emit('close')"
  >
    <template #header>
      <div class="sheet-head">
        <b>{{ exerciseName(exercise.slug) }}</b>
        <button class="btn-close" aria-label="Schließen" @click="emit('close')">✕</button>
      </div>
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
      <RankProgress
        v-if="rankRow"
        variant="card"
        :tier="rankRow.tier"
        :division="rankRow.division"
        :lp="rankRow.lp"
        :next-target-weight-kg="rankRow.nextTargetWeightKg"
        :next-target-reps="rankRow.nextTargetReps"
        :trust="rankRow.trust"
      />
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
  </SheetModal>
</template>

<style scoped>
/* #header slot content — replicates SheetModal's own (scoped-to-it, so not reachable here)
   .sheet-head title bar, plus the new tab strip pinned right below it. */
.sheet-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--sp5) var(--sp5) 0;
}
.sheet-head b {
  font-size: 17px;
}
.tab-strip {
  display: flex;
  gap: var(--sp2);
  padding: var(--sp4) var(--sp5) 0;
  overflow-x: auto;
}
.tab-pill {
  flex: none;
  padding: 7px 14px;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: var(--surface-2);
  color: var(--dim);
  font-size: 13px;
  font-weight: 700;
}
.tab-pill.active {
  background: var(--surface-3, var(--surface-2));
  border-color: var(--line-2);
  color: var(--text);
}
.hint {
  color: var(--dim);
  font-size: 13px;
}
.wide-chart {
  width: 100%;
  margin-bottom: var(--sp4);
}
/* ProgressChart.vue's own scoped layout is a compact flex row (fixed 140px spark + inline
   latest-value label) sized for the Ränge grid's card slot. Full sheet width (plan requirement)
   needs the spark to actually grow — stack chart-above-label instead of forcing the label to
   share a row it no longer fits. */
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
  border-color: var(--red);
  background: var(--red-lo);
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
  background: #5f7fd6;
}
</style>
