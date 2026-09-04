<script setup lang="ts">
/**
 * Past-workout detail (feedback: "not possible to look into past workouts"). Opens as a sheet
 * from a dashboard/history row rather than a new route. Built on the shared SheetModal.vue
 * (IonModal + header + close button), which this component and ExerciseInfoPanel.vue used to
 * duplicate independently.
 *
 * GET /api/workouts/:id has existed since the workout routes were first built, labeled in its
 * own server comment as "for the history detail view... and share cards" — this is the first
 * client code to ever call it.
 */
import type { WorkoutCardModel } from "@liftr/shared";
import { computed, onMounted, ref } from "vue";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useExerciseName } from "../../composables/useExerciseName";
import { canvasToBlob, drawWorkoutCard, shareOrDownloadBlob } from "../../lib/shareCard";
import { useCatalogStore } from "../../stores/catalogStore";
import { useHistoryStore, type WorkoutDetail } from "../../stores/historyStore";
import { useOverallRankStore } from "../../stores/overallRankStore";
import { useRanksStore } from "../../stores/ranksStore";
import { useXpStore } from "../../stores/xpStore";
import ExerciseRow from "../exercise/ExerciseRow.vue";
import MuscleFigure from "../ui/MuscleFigure.vue";
import SheetModal from "../ui/SheetModal.vue";
import StatTile from "../ui/StatTile.vue";

const props = defineProps<{ workoutId: string; title?: string }>();
const emit = defineEmits<{ close: [] }>();

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
const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);

/**
 * Deletion reverses LP server-side (routes/workouts.ts recomputes every touched exercise's
 * rank) and XP is never cached in the first place — reload both here so the rest of the app
 * (nav chips, Ränge tab) reflects the loss immediately instead of on next natural refresh.
 *
 * Closes via sheetRef.dismiss(), not `emit("close")` directly (feedback: "deleting a past
 * workout gets stuck at the delete screen") — see SheetModal.vue's header comment for why a
 * direct emit/unmount here raced Ionic's own modal teardown instead of cleanly finishing it.
 */
const deleteConfirm = useConfirmTap(async () => {
  deleting.value = true;
  try {
    await history.deleteWorkout(props.workoutId);
    await Promise.all([ranksStore.load(), xpStore.load()]);
    sheetRef.value?.dismiss();
  } finally {
    deleting.value = false;
  }
});

onMounted(async () => {
  detail.value = await history.loadWorkout(props.workoutId);
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
  const m = Math.round(s / 60);
  return `${m} min`;
});

const totalVolumeKg = computed(() =>
  orderedExercises.value.reduce(
    (sum, we) => sum + we.sets.reduce((s, set) => s + (set.weightKg ?? 0) * set.reps, 0),
    0,
  ),
);
const totalSets = computed(() => orderedExercises.value.reduce((sum, we) => sum + we.sets.filter((s) => !s.isWarmup).length, 0));
const prCount = computed(() => orderedExercises.value.reduce((sum, we) => sum + we.sets.filter((s) => s.isPr).length, 0));

const dateLabel = computed(() =>
  detail.value ? new Date(detail.value.startedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "long", year: "numeric" }) : "",
);

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
      routineName: props.title ?? "Workout",
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
      // Phase 5: shows the account's *current* overall tier, not a reconstruction of what it was
      // back when this specific past workout happened (that would need a historical snapshot
      // this view doesn't have) — same documented-simplification convention as prCount above.
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
  <!-- Was a 420px floating card, on mobile too (feedback: "doesn't use enough width", and it
       differed from ExerciseInfoPanel's right-drawer for no content-driven reason) — now the
       same drawer shape as the exercise-info sheet, full-width on mobile like every other sheet
       in the app, and wider than the info drawer on desktop since this view's content (a stat
       grid, muscle figure, exercise list) is denser. -->
  <SheetModal
    ref="sheetRef"
    :title="title ?? 'Workout-Details'"
    width="100%"
    max-width="94vw"
    height="88%"
    desktop-variant="drawer"
    desktop-width="560px"
    desktop-height="100%"
    @close="emit('close')"
  >
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
                <span v-for="s in we.sets" :key="s.id" class="set-chip" :class="{ warmup: s.isWarmup, pr: s.isPr }" :title="s.isPr ? 'Persönlicher Rekord' : undefined">
                  <!-- reps×weight, matching shareCard.ts's same fix (feedback: "8x7,5kg" not "7,5x8"). -->
                  <template v-if="s.weightKg != null">{{ s.reps }}×{{ s.weightKg }}kg</template>
                  <template v-else>{{ s.reps }}</template>
                  <span v-if="s.isPr" aria-hidden="true"> 🏆</span>
                </span>
              </span>
            </template>
          </ExerciseRow>
        </li>
      </ul>

      <button class="btn-primary btn-block" :disabled="sharing" @click="share">
        {{ sharing ? "Erstelle Bild…" : "📤 Als Bild teilen" }}
      </button>
      <button
        class="btn-secondary btn-block delete-btn"
        :class="{ confirming: deleteConfirm.isArmed() }"
        :disabled="deleting"
        @click="deleteConfirm.trigger()"
      >
        {{ deleting ? "Wird gelöscht…" : deleteConfirm.isArmed() ? "Wirklich löschen? (XP/Rang werden zurückgenommen)" : "🗑 Workout löschen" }}
      </button>
      <canvas ref="shareCanvas" class="share-canvas" aria-hidden="true" />
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
  font-size: 11px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-3);
  border-radius: 999px;
  padding: 2px 8px;
}
.set-chip.warmup {
  color: var(--faint);
}
.set-chip.pr {
  color: var(--pr);
  border: 1px solid var(--pr);
}
.btn-primary {
  margin-top: var(--sp5);
}
.delete-btn {
  margin-top: var(--sp2);
  color: var(--red);
}
.delete-btn.confirming {
  background: var(--red-lo);
  border-color: var(--red);
  color: var(--text);
}
.share-canvas {
  display: none;
}
</style>
