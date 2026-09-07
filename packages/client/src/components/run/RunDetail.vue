<script setup lang="ts">
/**
 * Past-run detail (UI audit fix: "Letzte Aktivität" run rows on OverviewPage.vue were permanently
 * `disabled` — the only feed row that visibly did nothing when tapped, unlike workout rows which
 * already open WorkoutDetail.vue). Mirrors WorkoutDetail.vue's exact pattern: a sheet built on the
 * shared SheetModal.vue, loading full detail on mount via a store action that already existed
 * (runsStore.loadDetail()/getRunDetail — built for RunsPage.vue's inline layout, never reused from
 * a modal before). Reuses RunReplay.vue (which itself wraps RunMap.vue) for the route visualization
 * exactly as RunsPage.vue does, rather than duplicating map/replay logic here.
 */
import { onMounted, ref } from "vue";
import { useRunsStore, type RunDetail as RunDetailModel } from "../../stores/runsStore";
import RunReplay from "./RunReplay.vue";
import SheetModal from "../ui/SheetModal.vue";
import StatTile from "../ui/StatTile.vue";

const props = defineProps<{ runId: string }>();
const emit = defineEmits<{ close: [] }>();

const runsStore = useRunsStore();
const loading = ref(true);
const detail = ref<RunDetailModel | null>(null);

onMounted(async () => {
  try {
    detail.value = await runsStore.loadDetail(props.runId);
  } catch {
    // offline or request failed — `detail` stays null, template shows the "couldn't load" hint
  } finally {
    loading.value = false;
  }
});

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" });
}
function formatDuration(s: number) {
  const m = Math.round(s / 60);
  return `${m} min`;
}
function formatPace(sPerKm: number | null) {
  if (sPerKm == null) return "–";
  const s = Math.round(sPerKm);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}/km`;
}
</script>

<template>
  <SheetModal
    :title="detail?.name ?? 'Lauf-Details'"
    width="100%"
    max-width="94vw"
    height="88%"
    desktop-variant="drawer"
    desktop-width="560px"
    desktop-height="100%"
    @close="emit('close')"
  >
    <p v-if="loading" class="hint">Lädt…</p>
    <p v-else-if="!detail" class="hint">Dieser Lauf ließ sich nicht laden — möglicherweise keine Verbindung zum Server.</p>

    <template v-else>
      <div class="date-line tnum">{{ formatDate(detail.startedAt) }}</div>

      <div class="stat-row">
        <StatTile :value="`${(detail.distanceM / 1000).toFixed(2)} km`" label="Distanz" />
        <StatTile :value="formatDuration(detail.durationS)" label="Dauer" />
        <StatTile :value="formatPace(detail.avgPaceSPerKm)" label="Pace ø" />
        <StatTile :value="detail.avgHr != null ? Math.round(detail.avgHr) + ' bpm' : '–'" label="Puls ø" />
      </div>

      <RunReplay v-if="detail.points.length > 0" :points="detail.points" />
      <p v-else class="hint">Manuell erfasster Lauf — keine Route verfügbar.</p>
    </template>
  </SheetModal>
</template>

<style scoped>
.hint {
  color: var(--dim);
}
.date-line {
  color: var(--dim);
  font-weight: 700;
  margin-bottom: var(--sp4);
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp2);
  margin-bottom: var(--sp5);
}
</style>
