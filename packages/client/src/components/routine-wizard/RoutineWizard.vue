<script setup lang="ts">
/**
 * Routine builder/editor, rebuilt as a mobile-first wizard (replaces RoutineBuilder.vue's flat
 * form — checkbox list + tiny number inputs + 20x16px reorder buttons squeezed inline into a
 * narrow column). Full-screen modal, three steps: pick exercises → arrange (order, per-set
 * reps, supersets) → review & save. Create mode starts on "pick"; edit mode (a `routine` prop)
 * starts directly on "arrange" since exercises already exist.
 *
 * Owns the whole draft as one reactive Map so every step is a thin, mostly-presentational
 * child — mutating a reactive object passed down as a prop is fine in Vue (the prop reference
 * itself is never reassigned), same pattern the old RoutineBuilder.vue already used for its
 * `selected` Map.
 */
import type { SetKind } from "@liftr/shared";
import { computed, reactive, ref, watch } from "vue";
import SheetModal from "../ui/SheetModal.vue";
import { useConfirmTap } from "../../composables/useConfirmTap";
import { useToast } from "../../composables/useToast";
import { useCatalogStore } from "../../stores/catalogStore";
import { recommendExercises } from "../../services/routineService";
import { useRoutineStore, type Routine, type RoutineExerciseInput, type SetTarget } from "../../stores/routineStore";
import ArrangeStep from "./ArrangeStep.vue";
import FastPathStep from "./FastPathStep.vue";
import PathChooser from "./PathChooser.vue";
import PickStep from "./PickStep.vue";
import ReviewStep from "./ReviewStep.vue";

const props = defineProps<{ routine?: Routine | null }>();
const emit = defineEmits<{ created: [] }>();

const routineStore = useRoutineStore();
const catalog = useCatalogStore();
const { toast } = useToast();

/** RestTimer.vue's own built-in fallback when a routine doesn't override it — kept in sync
 *  manually since RestTimer's default lives in its own props declaration, not an export. */
const DEFAULT_REST_SECONDS = 90;

export interface DraftExercise {
  sets: SetTarget[];
  linkNext: boolean;
  /** Feedback: "adjust the pause, per set and per exercise" — rest between this exercise's own
   *  sets, and a separate rest after its last set before moving to the next exercise. */
  restBetweenSetsSeconds: number;
  restAfterExerciseSeconds: number;
}

const name = ref("");
const selected = reactive(new Map<string, DraftExercise>());
/** "choose" only ever appears in create mode, before any exercise is picked — see hydrateFrom. */
const step = ref<"choose" | "pick" | "arrange" | "review">("pick");
const saving = ref(false);
const suggesting = ref(false);
/** Which PickStep sub-screen to show once "pick" is reached — set by PathChooser's step-0
 *  choice, or forced to "manual" whenever Pick is re-entered mid-build (see goToPick). */
const pickMode = ref<"manual" | "muscles">("manual");
/** Set by FastPathStep's "Alle Details anpassen" escape hatch — once a user asks for the full
 *  flow, respect that for the rest of this create/edit session even if the routine still looks
 *  simple, rather than snapping back to the condensed screen mid-edit. */
const fastPathOverride = ref(false);

/** Engagement-audit-v4 Phase 1: the rationale behind a muscle-guided pick — which requested
 *  muscle earned it a slot, whether it replaced a preferred exercise the user can't perform with
 *  their equipment — kept alongside the draft so ReviewStep can show it instead of the server
 *  computing it and this component throwing it away (the pre-Phase-1 behavior). Absent for
 *  manually-picked exercises; keyed by exerciseId, not nested in DraftExercise, so the manual
 *  path's type stays untouched. */
const suggestionMeta = reactive<Record<string, { matchedMuscleSlug?: string; isSubstitute?: boolean }>>({});
/** Every muscle slug the user has asked "Übungen vorschlagen" for this session, across possibly
 *  multiple visits to the muscle-picker (e.g. via "+ Übung hinzufügen") — ReviewStep compares the
 *  final routine's actual muscle coverage against this to flag anything requested but not landed. */
const requestedMuscleSlugs = ref<string[]>([]);

/** Feature: "quickly create new routines based on past experience and a selection of muscle
 *  groups" — PickStep's muscle-group mode hands back the picked slugs; the server's
 *  recommendation (real stats, or a standards-based entry-level fallback for a brand-new
 *  lifter) becomes the draft directly, same shape toggleSelect() would have built by hand, then
 *  jumps to "arrange" so the user reviews/tweaks it before saving — never auto-saved. */
async function applySuggestions(muscleSlugs: string[]) {
  if (suggesting.value) return;
  suggesting.value = true;
  try {
    const suggestions = await routineStore.suggest(muscleSlugs);
    for (const s of suggestions) {
      selected.set(s.exerciseId, {
        sets: s.targetSets.map((t) => ({ ...t })),
        linkNext: false,
        restBetweenSetsSeconds: DEFAULT_REST_SECONDS,
        restAfterExerciseSeconds: DEFAULT_REST_SECONDS,
      });
      if (s.matchedMuscleSlug) {
        suggestionMeta[s.exerciseId] = { matchedMuscleSlug: s.matchedMuscleSlug, isSubstitute: s.isSubstitute ?? false };
      }
    }
    if (suggestions.length > 0) {
      requestedMuscleSlugs.value = [...new Set([...requestedMuscleSlugs.value, ...muscleSlugs])];
      step.value = "arrange";
    }
  } finally {
    suggesting.value = false;
  }
}

function hydrateFrom(routine: Routine | null | undefined) {
  selected.clear();
  // Suggestion rationale never survives a save (routineExercises carries no muscle/substitution
  // fields) and never applies to a routine being edited — re-suggesting inside an edit session
  // starts this bookkeeping fresh rather than mixing it with a prior create-session's state.
  for (const key of Object.keys(suggestionMeta)) delete suggestionMeta[key];
  requestedMuscleSlugs.value = [];
  pickMode.value = "manual";
  fastPathOverride.value = false;
  if (!routine) {
    name.value = "";
    step.value = "choose";
    return;
  }
  name.value = routine.name;
  const ordered = routine.routineExercises.slice().sort((a, b) => a.orderIndex - b.orderIndex);
  for (let i = 0; i < ordered.length; i++) {
    const re = ordered[i]!;
    const next = ordered[i + 1];
    selected.set(re.exerciseId, {
      sets: re.targetSets.map((s) => ({ ...s })),
      linkNext: re.supersetGroup != null && next?.supersetGroup === re.supersetGroup,
      restBetweenSetsSeconds: re.restBetweenSetsSeconds ?? DEFAULT_REST_SECONDS,
      restAfterExerciseSeconds: re.restAfterExerciseSeconds ?? DEFAULT_REST_SECONDS,
    });
  }
  step.value = "arrange";
}
watch(() => props.routine, hydrateFrom, { immediate: true });

const isEditing = computed(() => props.routine != null);
const selectedIds = computed(() => new Set(selected.keys()));
/** insertion order = the order exercises save in, and what the superset-linking UI walks. */
const selectedOrder = computed(() => Array.from(selected.entries()));

/** A set list is still exactly the naive fallback toggleSelect() started it at — i.e. nothing's
 *  edited it yet — so the background recommendation upgrade below is safe to overwrite it. */
function isUntouchedDefault(sets: SetTarget[]): boolean {
  return sets.length === 3 && sets.every((s) => s.reps === 8);
}

function toggleSelect(exerciseId: string) {
  if (selected.has(exerciseId)) {
    selected.delete(exerciseId);
    return;
  }
  // Bodyweight exercises default to no weight target (plain push-ups); loaded ones default to
  // 0 kg so the stepper is visible right away. See ArrangeStep's "+ Zusatzgewicht" toggle for
  // turning weight tracking on for a bodyweight exercise (weighted dips/pull-ups).
  const isBodyweight = catalog.byId(exerciseId)?.isBodyweight ?? false;
  const weightKg = isBodyweight ? null : 0;
  selected.set(exerciseId, {
    sets: [
      { reps: 8, weightKg },
      { reps: 8, weightKg },
      { reps: 8, weightKg },
    ],
    linkNext: false,
    restBetweenSetsSeconds: DEFAULT_REST_SECONDS,
    restAfterExerciseSeconds: DEFAULT_REST_SECONDS,
  });
  void upgradeToRecommendedDefaults(exerciseId);
}

/**
 * QUAL-04: the flat "8 reps, 0 kg" above used to be the final answer for a manually-picked
 * exercise, regardless of the lifter's stated experience level or history. The naive default
 * still appears instantly (selecting an exercise must stay a zero-latency tap, not wait on a
 * network round trip) — this fire-and-forget upgrade swaps in the same server-side
 * recommendation the muscle-group suggester uses, the moment it resolves. Never overwrites a
 * set the user has actually started editing (isUntouchedDefault), and silently no-ops offline
 * or if the exercise was deselected before the response came back — a background upgrade that
 * fails is a non-event, not an error.
 */
async function upgradeToRecommendedDefaults(exerciseId: string) {
  try {
    const [recommended] = await recommendExercises([exerciseId]);
    const cfg = selected.get(exerciseId);
    if (cfg && recommended && isUntouchedDefault(cfg.sets)) {
      cfg.sets = recommended.targetSets.map((t) => ({ ...t }));
    }
  } catch {
    // offline or request failed — the naive default stands
  }
}

function moveExercise(from: number, to: number) {
  const entries = selectedOrder.value.slice();
  const [moved] = entries.splice(from, 1);
  entries.splice(to, 0, moved!);
  selected.clear();
  for (const [id, cfg] of entries) selected.set(id, cfg);
}

function addSet(exerciseId: string) {
  const cfg = selected.get(exerciseId);
  if (!cfg) return;
  const last = cfg.sets[cfg.sets.length - 1];
  cfg.sets.push(last ? { ...last } : { reps: 8, weightKg: null });
}

function removeSet(exerciseId: string, index: number) {
  const cfg = selected.get(exerciseId);
  if (!cfg || cfg.sets.length <= 1) return;
  cfg.sets.splice(index, 1);
}

function adjustSetReps(exerciseId: string, index: number, delta: number) {
  const cfg = selected.get(exerciseId);
  const set = cfg?.sets[index];
  if (!set) return;
  set.reps = Math.max(1, set.reps + delta);
}

const WEIGHT_STEP_KG = 1.25;

function adjustSetWeight(exerciseId: string, index: number, delta: number) {
  const cfg = selected.get(exerciseId);
  const set = cfg?.sets[index];
  if (!set || set.weightKg === null) return;
  set.weightKg = Math.max(0, Math.round((set.weightKg + delta * WEIGHT_STEP_KG) * 100) / 100);
}

/** Feature: "not possible to set what kind of set this is when creating/editing a routine, not
 *  mid workout" — cycles a target set's kind, same four values SetKindPicker.vue offers live.
 *  Untouched sets stay "normal" (kind starts undefined, ArrangeStep's badge shows it as normal),
 *  so this is a strictly opt-in, additive control. */
const SET_KIND_CYCLE: SetKind[] = ["normal", "warmup", "failure", "dropset"];
function cycleSetKind(exerciseId: string, index: number) {
  const cfg = selected.get(exerciseId);
  const set = cfg?.sets[index];
  if (!set) return;
  const current = set.kind ?? "normal";
  const next = SET_KIND_CYCLE[(SET_KIND_CYCLE.indexOf(current) + 1) % SET_KIND_CYCLE.length]!;
  set.kind = next === "normal" ? undefined : next;
}

/**
 * Bodyweight exercises start with weightKg: null (no weight stepper shown at all — plain
 * push-ups). This flips every set of the exercise between "no weight target" and "tracked,
 * starting at 0" in one action — per-set fine-tuning happens after via adjustSetWeight, same
 * as reps. One toggle per exercise rather than per set: if you're adding a weight vest/belt,
 * you're doing it for the whole exercise, not one set out of three.
 */
function toggleWeightTracking(exerciseId: string) {
  const cfg = selected.get(exerciseId);
  if (!cfg) return;
  const nowTracking = cfg.sets[0]?.weightKg === null;
  for (const s of cfg.sets) s.weightKg = nowTracking ? 0 : null;
}

const REST_STEP_SECONDS = 15;
const MIN_REST_SECONDS = 0;

function adjustRestBetweenSets(exerciseId: string, delta: number) {
  const cfg = selected.get(exerciseId);
  if (!cfg) return;
  cfg.restBetweenSetsSeconds = Math.max(MIN_REST_SECONDS, cfg.restBetweenSetsSeconds + delta * REST_STEP_SECONDS);
}

function adjustRestAfterExercise(exerciseId: string, delta: number) {
  const cfg = selected.get(exerciseId);
  if (!cfg) return;
  cfg.restAfterExerciseSeconds = Math.max(MIN_REST_SECONDS, cfg.restAfterExerciseSeconds + delta * REST_STEP_SECONDS);
}

function toggleLink(exerciseId: string) {
  const cfg = selected.get(exerciseId);
  if (cfg) cfg.linkNext = !cfg.linkNext;
}

function removeExercise(exerciseId: string) {
  selected.delete(exerciseId);
  delete suggestionMeta[exerciseId];
}

/**
 * Consecutive-adjacency toggle for supersets/circuits (plan §6.6): a chain of linked entries
 * becomes one group; unlinked entries stay standalone. Unchanged from the old RoutineBuilder.
 */
const supersetGroups = computed<(number | null)[]>(() => {
  const entries = selectedOrder.value;
  const groups: (number | null)[] = new Array(entries.length).fill(null);
  let groupCounter = 0;
  let i = 0;
  while (i < entries.length) {
    let j = i;
    while (j < entries.length - 1 && entries[j]![1].linkNext) j++;
    if (j > i) {
      groupCounter++;
      for (let k = i; k <= j; k++) groups[k] = groupCounter;
    }
    i = j + 1;
  }
  return groups;
});

const totalSets = computed(() => selectedOrder.value.reduce((sum, [, cfg]) => sum + cfg.sets.length, 0));

const canSave = computed(() => name.value.trim().length > 0 && selected.size > 0);

/**
 * Engagement-audit-v4 Phase 1 fast path: simple enough (few exercises, nothing customized, no
 * supersets) that Arrange+Review can collapse into one condensed screen (FastPathStep.vue)
 * instead of the full multi-step flow. Re-evaluated live as the draft changes, so adding a set or
 * linking a superset drops a routine out of the fast path automatically — the escape hatch
 * (fastPathOverride) exists for the opposite direction, staying in the full flow on request even
 * while the draft still looks simple.
 */
const FAST_PATH_MAX_EXERCISES = 4;
const DEFAULT_SET_COUNT = 3;
/**
 * Deliberately structural, not content-based: this must NOT reuse isUntouchedDefault's
 * reps===8 check. Both the manual pick's background upgrade (upgradeToRecommendedDefaults) and
 * the muscle-guided suggester fill in a real recommended weight/rep target almost immediately —
 * a routine with those real numbers is exactly the simple case this path exists for, not a
 * "customized" one. What actually signals hands-on customization, per the shape brief, is adding
 * a set, linking a superset, or changing rest — set *count*, not set *content*.
 */
function isUntouchedForFastPath(cfg: DraftExercise): boolean {
  return (
    cfg.sets.length === DEFAULT_SET_COUNT &&
    cfg.restBetweenSetsSeconds === DEFAULT_REST_SECONDS &&
    cfg.restAfterExerciseSeconds === DEFAULT_REST_SECONDS &&
    cfg.sets.every((s) => !s.kind)
  );
}
const isFastPathEligible = computed(() => {
  const entries = selectedOrder.value;
  if (entries.length === 0 || entries.length > FAST_PATH_MAX_EXERCISES) return false;
  return entries.every(([, cfg]) => !cfg.linkNext && isUntouchedForFastPath(cfg));
});
const showFastPath = computed(() => isFastPathEligible.value && !fastPathOverride.value);

const sheetRef = ref<InstanceType<typeof SheetModal> | null>(null);

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    const exercises: RoutineExerciseInput[] = selectedOrder.value.map(([exerciseId, cfg], i) => ({
      exerciseId,
      orderIndex: i,
      // reps rounded defensively here too (belt-and-suspenders alongside the fix in
      // recommend.ts): the server's schema requires an integer, and this is the single choke
      // point every save path — manual, suggested, or edited — funnels through before POST/PATCH.
      targetSets: cfg.sets.map((s) => ({ ...s, reps: Math.max(1, Math.round(s.reps)) })),
      supersetGroup: supersetGroups.value[i] ?? null,
      restBetweenSetsSeconds: cfg.restBetweenSetsSeconds,
      restAfterExerciseSeconds: cfg.restAfterExerciseSeconds,
    }));
    try {
      if (props.routine) {
        await routineStore.update(props.routine.id, { name: name.value.trim(), exercises });
      } else {
        await routineStore.create(name.value.trim(), exercises);
      }
    } catch {
      // Save can genuinely fail (e.g. a suggested exercise substitution produced an
      // out-of-contract value the server rejects) — without this, the rejection was an
      // unhandled promise rejection and the sheet just sat there looking unresponsive with
      // zero feedback (audit: silent save-path failure on the muscle-guided suggestion flow).
      toast("Speichern fehlgeschlagen — bitte erneut versuchen.");
      return;
    }
    // Closes via sheetRef.dismiss(), not emit("created") directly (feedback: "editing/creating
    // a workout currently does not work" — a hard crash). See SheetModal.vue's header comment:
    // every close here now goes through Ionic's real dismiss() first; the parent only actually
    // unmounts this component once SheetModal's @close fires below, after that teardown
    // finishes, instead of racing it by unmounting immediately on our own say-so.
    sheetRef.value?.dismiss();
  } finally {
    saving.value = false;
  }
}

/** Tap-twice close when there's anything to lose — same pattern as WorkoutPage's cancel-workout
 *  and delete-routine confirms, via the shared useConfirmTap composable. Bypassed entirely when
 *  nothing's been picked yet — closing an empty draft is free, no confirm needed. Both branches
 *  call dismiss(), never emit("created") directly — see save()'s comment above. */
const closeConfirm = useConfirmTap(() => sheetRef.value?.dismiss());
function requestClose() {
  if (selected.size === 0) {
    sheetRef.value?.dismiss();
    return;
  }
  closeConfirm.trigger();
}

/** PathChooser's step-0 choice — the only place `pickMode` is set to "muscles". */
function choosePath(mode: "manual" | "muscles") {
  pickMode.value = mode;
  step.value = "pick";
}
/** Re-entry into Pick mid-build (ArrangeStep's/FastPathStep's "+ Übung hinzufügen") always means
 *  "add one more exercise by hand" — never a re-run of the muscle-group suggester, so this skips
 *  PathChooser entirely rather than asking the question again. */
function goToPick() {
  pickMode.value = "manual";
  step.value = "pick";
}
function goToArrange() {
  step.value = "arrange";
}
function goToReview() {
  step.value = "review";
}
function useFullArrange() {
  fastPathOverride.value = true;
}
</script>

<template>
  <!-- Full-bleed, non-draggable shape (sheet=false) — same underlying IonModal shell as every
       other modal in the app now (feedback: "every modal should reuse the same base"), with a
       custom header via #header instead of the shell's default title+close bar, since a
       three-step wizard needs a step indicator and name input up there, not a plain title. -->
  <!-- @close only ever fires after Ionic's own dismiss teardown completes (see this component's
       script) — it's the single place that actually tells the parent it's safe to unmount,
       never a stand-in for "the user asked to close" (that's requestClose, which decides
       whether to dismiss now or arm the confirm first). backdropDismiss defaults to false here
       since sheet=false — a stray tap outside a full-screen edit flow shouldn't be able to
       discard a draft, bypassing the confirm guard entirely. -->
  <SheetModal ref="sheetRef" :sheet="false" background="var(--bg)" @close="emit('created')">
    <template #header>
      <header class="wizard-head">
        <button class="btn-close close-btn" :class="{ confirming: closeConfirm.isArmed() }" aria-label="Schließen" @click="requestClose">
          {{ closeConfirm.isArmed() ? "Verwerfen?" : "✕" }}
        </button>
        <input v-model="name" class="name-input" type="text" placeholder="Name der Routine" aria-label="Name der Routine" />
        <!-- Audit fix (workplan-v1 §1.9c): FastPathStep's save goes straight to save(), never
             reaching ReviewStep — the indicator used to promise "3 Fertig" unconditionally and
             then not show it on this path. showFastPath already tracks whether the current
             selection is small/untouched enough to take that path (and flips live if the user
             taps "customize"), so gating step 3's label on it keeps the indicator honest in both
             directions rather than adding a step back to a flow built to remove one. -->
        <div class="steps">
          <span :class="{ active: step === 'choose' || step === 'pick' }">1 Wählen</span>
          <span :class="{ active: step === 'arrange' }">2 {{ showFastPath ? "Fertig" : "Anordnen" }}</span>
          <span v-if="!showFastPath" :class="{ active: step === 'review' }">3 Fertig</span>
        </div>
      </header>
    </template>

    <PathChooser v-if="step === 'choose'" @choose="choosePath" />
    <PickStep
      v-else-if="step === 'pick'"
      :selected-ids="selectedIds"
      :suggesting="suggesting"
      :mode="pickMode"
      @toggle="toggleSelect"
      @continue="goToArrange"
      @suggest="applySuggestions"
    />
    <FastPathStep
      v-else-if="step === 'arrange' && showFastPath"
      :name="name"
      :entries="selectedOrder"
      :saving="saving"
      :can-save="canSave"
      :is-editing="isEditing"
      :requested-muscle-slugs="requestedMuscleSlugs"
      :suggestion-meta="suggestionMeta"
      @move="moveExercise"
      @remove-exercise="removeExercise"
      @add-exercise="goToPick"
      @customize="useFullArrange"
      @save="save"
    />
    <ArrangeStep
      v-else-if="step === 'arrange'"
      :entries="selectedOrder"
      @move="moveExercise"
      @add-set="addSet"
      @remove-set="removeSet"
      @adjust-set-reps="adjustSetReps"
      @adjust-set-weight="adjustSetWeight"
      @cycle-set-kind="cycleSetKind"
      @adjust-rest-between-sets="adjustRestBetweenSets"
      @adjust-rest-after-exercise="adjustRestAfterExercise"
      @toggle-weight-tracking="toggleWeightTracking"
      @toggle-link="toggleLink"
      @remove-exercise="removeExercise"
      @add-exercise="goToPick"
      @continue="goToReview"
    />
    <ReviewStep
      v-else
      :name="name"
      :entries="selectedOrder"
      :total-sets="totalSets"
      :saving="saving"
      :can-save="canSave"
      :is-editing="isEditing"
      :requested-muscle-slugs="requestedMuscleSlugs"
      :suggestion-meta="suggestionMeta"
      @back="goToArrange"
      @save="save"
    />
  </SheetModal>
</template>

<style scoped>
.wizard-head {
  flex: none;
  padding: var(--sp4);
  border-bottom: 1px solid var(--line);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.close-btn {
  align-self: flex-end;
}
.close-btn.confirming {
  width: auto;
  padding: 0 12px;
  border-radius: var(--r-md);
  background: var(--red-lo);
  border-color: var(--red);
  font-size: 12px;
  font-weight: 700;
}
.name-input {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}
.steps {
  display: flex;
  gap: var(--sp3);
  font-size: 11px;
  font-weight: 700;
  color: var(--faint);
}
.steps .active {
  color: var(--blue-hi);
}
</style>
