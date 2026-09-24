<script setup lang="ts">
/**
 * Past-workout detail — a routed page (was WorkoutDetail.vue's SheetModal sheet), reached via
 * `/workouts/:id` for a real URL, back-button semantics, and a cold deep-link, converging with
 * ExerciseDetailPage.vue and RunDetailPage.vue on the same BasePage shell.
 *
 * GET /api/workouts/:id doesn't carry the workout's own display title (the history feed's title
 * is server-derived per list row, not stored on the workout itself) — the opening feed row passes
 * it through as a `title` query param (same idiom as `/routes/:id?autostart=live`), falling back
 * to a generic title for a cold/direct deep-link.
 */
import type { WorkoutCardModel } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useConfirmTap } from "../composables/useConfirmTap";
import { useExerciseName } from "../composables/useExerciseName";
import { formatDateLong, formatDurationMinutes } from "../lib/format";
import { canvasToBlob, drawWorkoutCard, shareOrDownloadBlob } from "../lib/shareCard";
import AppIcon from "../components/base/AppIcon.vue";
import BasePage from "../components/patterns/BasePage.vue";
import Button from "../components/base/Button.vue";
import Chip from "../components/base/Chip.vue";
import { useCatalogStore } from "../stores/catalogStore";
import { useHistoryStore, type WorkoutDetail } from "../stores/historyStore";
import { useOverallRankStore } from "../stores/overallRankStore";
import { useRanksStore } from "../stores/ranksStore";
import { useXpStore } from "../stores/xpStore";
import ExerciseRow from "../components/exercise/ExerciseRow.vue";
import MuscleFigure from "../components/exercise/MuscleFigure.vue";
import StatTile from "../components/patterns/StatTile.vue";

const route = useRoute();
const router = useRouter();
const workoutId = computed(() => route.params.id as string);
const title = computed(() => (route.query.title as string | undefined) ?? "Workout-Details");

const history = useHistoryStore();
const catalog = useCatalogStore();
const ranksStore = useRanksStore();
const xpStore = useXpStore();
const overallRank = useOverallRankStore();
const { exerciseName } = useExerciseName();

const loading = ref(true);
const detail = ref<WorkoutDetail | null>(null);
const shareCanvas = ref<HTMLCanvasElement | null>(null);
const sharing = ref(false);
const deleting = ref(false);

/** Deletion reverses LP server-side (routes/workouts.ts recomputes every touched exercise's
 *  rank) and XP is never cached in the first place — reload both here so the rest of the app
 *  (nav chips, Ränge tab) reflects the loss immediately instead of on next natural refresh. */
const deleteConfirm = useConfirmTap(async () => {
  deleting.value = true;
  try {
    await history.deleteWorkout(workoutId.value);
    await Promise.all([ranksStore.load(), xpStore.load()]);
    router.back();
  } finally {
    deleting.value = false;
  }
});

onMounted(async () => {
  detail.value = await history.loadWorkout(workoutId.value);
  loading.value = false;
  void overallRank.load();
});

const orderedExercises = computed(() =>
  detail.value ? detail.value.workoutExercises.slice().sort((a, b) => a.orderIndex - b.orderIndex) : [],
);

const durationLabel = computed(() => {
  const d = detail.value;
  if (!d?.endedAt) return "—";
  const s = Math.max(0, (new Date(d.endedAt).getTime() - new Date(d.startedAt).getTime()) / 1000 - d.pausedSeconds);
  return formatDurationMinutes(s);
});

const totalVolumeKg = computed(() =>
  orderedExercises.value.reduce(
    (sum, we) => sum + we.sets.reduce((s, set) => s + (set.weightKg ?? 0) * set.reps, 0),
    0,
  ),
);
const totalSets = computed(() => orderedExercises.value.reduce((sum, we) => sum + we.sets.filter((s) => !s.isWarmup).length, 0));
const prCount = computed(() => orderedExercises.value.reduce((sum, we) => sum + we.sets.filter((s) => s.isPr).length, 0));

const dateLabel = computed(() => (detail.value ? formatDateLong(detail.value.startedAt) : ""));

/** Same union-of-primary-over-secondary logic as WorkoutPage.vue's sessionMuscles — reused via
 *  the same catalogStore lookup rather than re-derived, so the two never drift. */
const muscles = computed(() => {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const we of orderedExercises.value) {
    const full = catalog.byId(we.exerciseId);
    if (!full) continue;
    for (const m of full.muscles) {
      if (m.role === "primary") primary.add(m.slug);
      else secondary.add(m.slug);
    }
  }
  for (const slug of primary) secondary.delete(slug);
  return { primary: [...primary], secondary: [...secondary] };
});

async function share() {
  const d = detail.value;
  if (!d || !shareCanvas.value) return;
  sharing.value = true;
  try {
    const model: WorkoutCardModel = {
      kind: "workout",
      routineName: title.value,
      dateLabel: dateLabel.value,
      durationLabel: durationLabel.value,
      volumeKg: totalVolumeKg.value,
      setCount: totalSets.value,
      prCount: prCount.value,
      exercises: orderedExercises.value.map((we) => ({
        name: exerciseName(we.exercise.slug, we.exercise.name),
        sets: we.sets.map((s) => ({ weightKg: s.weightKg, reps: s.reps, isWarmup: s.isWarmup })),
      })),
      muscles: muscles.value,
      // Shows the account's *current* overall tier, not a reconstruction of what it was back
      // when this specific past workout happened (that would need a historical snapshot this
      // view doesn't have).
      tier: overallRank.current ? { tier: overallRank.current.tier, division: overallRank.current.division, level: xpStore.level } : null,
      // No "session's highest rank-up" concept for a past workout viewed later — that's a
      // finish-flow-only idea (see useWorkoutShareCard.ts).
      topRankUp: null,
    };
    await drawWorkoutCard(shareCanvas.value, model);
    const blob = await canvasToBlob(shareCanvas.value);
    if (blob) await shareOrDownloadBlob(blob, `liftr-workout-${d.id.slice(0, 8)}.png`, "Mein Liftr-Workout");
  } finally {
    sharing.value = false;
  }
}
</script>

<template>
  <BasePage :title="title" back-button variant="drawer">
    <p v-if="loading" class="hint">Lädt…</p>
    <p v-else-if="!detail" class="hint">Dieses Workout ließ sich nicht laden — möglicherweise keine Verbindung zum Server.</p>

    <template v-else>
      <div class="date-line tnum">{{ dateLabel }}</div>

      <div class="stat-row">
        <StatTile :value="durationLabel" label="Dauer" />
        <StatTile :value="`${Math.round(totalVolumeKg).toLocaleString('de-DE')} kg`" label="Volumen" />
        <StatTile :value="totalSets" label="Sätze" />
        <StatTile :value="orderedExercises.length" label="Übungen" />
      </div>

      <div class="eyebrow section-eyebrow">Trainierte Muskeln</div>
      <MuscleFigure :primary="muscles.primary" :secondary="muscles.secondary" />

      <div class="eyebrow section-eyebrow">Übungen</div>
      <ul class="ex-list">
        <li v-for="we in orderedExercises" :key="we.id">
          <ExerciseRow visual="icon" :size="18" :slug="we.exercise.slug" :equipment="we.exercise.equipment" :name="exerciseName(we.exercise.slug, we.exercise.name)">
            <template #meta>
              <span class="tnum set-chips">
                <Chip v-for="s in we.sets" :key="s.id" size="sm" class="set-chip" :class="{ warmup: s.isWarmup, pr: s.isPr }" :title="s.isPr ? 'Persönlicher Rekord' : undefined">
                  <template v-if="s.weightKg != null">{{ s.reps }}×{{ Math.round(s.weightKg * 100) / 100 }}kg</template>
                  <template v-else>{{ s.reps }}</template>
                  <span v-if="s.isPr" aria-hidden="true"> <AppIcon name="trophy" /></span>
                </Chip>
              </span>
            </template>
          </ExerciseRow>
        </li>
      </ul>

      <Button block :disabled="sharing" @click="share">
        <template v-if="sharing">Erstelle Bild…</template>
        <template v-else><AppIcon name="share" /> Als Bild teilen</template>
      </Button>
      <Button
        variant="secondary"
        block
        class="delete-btn"
        :class="{ confirming: deleteConfirm.isArmed() }"
        :disabled="deleting"
        @click="deleteConfirm.trigger()"
      >
        <template v-if="deleting">Wird gelöscht…</template>
        <template v-else-if="deleteConfirm.isArmed()">Wirklich löschen? (XP/Rang werden zurückgenommen)</template>
        <template v-else><AppIcon name="trash" /> Workout löschen</template>
      </Button>
      <canvas ref="shareCanvas" class="share-canvas" aria-hidden="true" />
    </template>
  </BasePage>
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
/* 4 tiles squeezed into one row left each card too narrow for its own value — e.g. "1.658 kg"
   wrapped awkwardly inside the Volumen tile. 2x2 gives each tile real width instead of fighting
   the other three for horizontal space; the row just grows a little taller. */
.stat-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp2);
  margin-bottom: var(--sp5);
}
.section-eyebrow {
  margin: var(--sp5) 0 var(--sp3);
  --eyebrow-color: var(--dim);
}
.ex-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.ex-list li {
  padding: var(--sp3);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
}
.ex-list :deep(.equipment-icon) {
  color: var(--blue-hi);
  margin-top: 2px;
}
.set-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
.set-chip {
  background: var(--surface-3);
  padding: 2px 8px;
}
.set-chip.warmup {
  color: var(--faint);
}
.set-chip.pr {
  color: var(--pr);
  border-color: var(--pr);
}
.btn-primary {
  margin-top: var(--sp5);
}
.delete-btn {
  margin-top: var(--sp2);
  color: var(--danger);
}
.delete-btn.confirming {
  background: var(--danger-lo);
  border-color: var(--danger);
  color: var(--text);
}
.share-canvas {
  display: none;
}
</style>
