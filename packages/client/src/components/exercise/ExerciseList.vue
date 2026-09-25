<script setup lang="ts">
/**
 * Filterable/searchable exercise list — search + equipment/muscle filters + thumbnail cards.
 * Extracted out of ExercisesPage.vue (the library tab) so the routine wizard's exercise picker
 * (PickStepManual.vue) reuses the exact same list instead of a second, drifting implementation. Two
 * modes on the same markup:
 *   - "browse" (the library tab): tap a card to open its info sheet.
 *   - "select" (the wizard): tap toggles membership in the caller's selection; selected cards
 *     get a checkmark badge + highlighted border so "what's picked" is visible at a glance
 *     alongside "what is this exercise" (the thumbnail).
 */
import { canPerform, missingByTier, type EquipmentRequirement, type TieredRequirement } from "@liftr/shared";
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../base/AppIcon.vue";
import { useExerciseName } from "../../composables/useExerciseName";
import { equipmentRequirementLabelDe } from "../../lib/equipmentIcons";
import { muscleLabel, MUSCLE_SLUGS } from "../../lib/muscles";
import { useCatalogStore, type CatalogExercise } from "../../stores/catalogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import ExerciseRow from "./ExerciseRow.vue";
import Chip from "../base/Chip.vue";
import EmptyNote from "../base/EmptyNote.vue";
import Input from "../base/Input.vue";
import Select from "../base/Select.vue";
import Button from "../base/Button.vue";

const props = withDefaults(defineProps<{ mode?: "browse" | "select"; selectedIds?: Set<string>; defaultOnlyDoable?: boolean }>(), {
  mode: "browse",
  selectedIds: () => new Set(),
  // Explicit `undefined` (not omitted!) so an absent prop resolves to `undefined`, not Vue's
  // usual "unset boolean prop -> false" auto-cast — the `?? props.mode !== "select"` below needs
  // to see a real "caller didn't specify" signal, not a false positive.
  defaultOnlyDoable: undefined,
});
const emit = defineEmits<{ open: [exercise: CatalogExercise]; toggle: [exercise: CatalogExercise] }>();

const { t } = useI18n();
const catalog = useCatalogStore();
const settingsStore = useSettingsStore();
const { exerciseName } = useExerciseName();

const search = ref("");
const equipmentFilter = ref("");
const muscleFilter = ref("");
// Defaults ON in "browse" mode — hiding exercises the user can't do with their owned equipment
// is the useful default there. In "select" mode (the routine wizard's manual picker) the caller
// decides via `defaultOnlyDoable` (PickStepManual.vue passes true — building a routine you intend to
// actually do should default to only showing what's doable; see UX-05). Either way, only
// offered/applied once there's actually an owned-equipment list to filter by (an unset/empty list
// means "no restriction configured", not "owns nothing"), and uses the full requiredEquipment
// list via canPerform, not just the one primary `equipment` tag.
const onlyDoableEquipment = ref(props.defaultOnlyDoable ?? props.mode !== "select");
const hasEquipmentFilter = computed(() => !!settingsStore.ownedEquipment && settingsStore.ownedEquipment.length > 0);

const equipmentOptions = computed(() => [...new Set(catalog.exercises.map((e) => e.equipment).filter((e): e is string => !!e))].sort());

function requirementsFor(e: CatalogExercise): TieredRequirement[] {
  const list = e.requiredEquipment;
  if (list && list.length > 0) return list;
  return e.equipment ? [{ item: e.equipment as EquipmentRequirement, tier: "required" as const }] : [];
}
// Only `required` misses gate the toggle/sort below; `recommended` misses are shown as a lighter
// hint regardless of the toggle, since they never make the exercise undoable.
function missingRequiredFor(e: CatalogExercise): EquipmentRequirement[] {
  return missingByTier(requirementsFor(e), settingsStore.ownedEquipment).required;
}
function missingRecommendedFor(e: CatalogExercise): EquipmentRequirement[] {
  return missingByTier(requirementsFor(e), settingsStore.ownedEquipment).recommended;
}

const filtered = computed(() =>
  catalog.exercises
    .filter((e) => {
      const q = search.value.trim().toLowerCase();
      if (q && !(e.slug.toLowerCase().includes(q) || exerciseName(e.slug, e.name).toLowerCase().includes(q))) return false;
      if (equipmentFilter.value && e.equipment !== equipmentFilter.value) return false;
      if (muscleFilter.value && !e.muscles.some((m) => m.slug === muscleFilter.value)) return false;
      if (onlyDoableEquipment.value && hasEquipmentFilter.value && !canPerform(requirementsFor(e), settingsStore.ownedEquipment)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Deprioritize (not hide) exercises the user can't currently do — most relevant when the
      // toggle above is off, harmless otherwise since everything shown is already doable then.
      // Only a required-tier gap deprioritizes; a recommended-only gap (e.g. no mat) doesn't.
      const doableDiff = Number(missingRequiredFor(a).length > 0) - Number(missingRequiredFor(b).length > 0);
      if (doableDiff !== 0) return doableDiff;
      return exerciseName(a.slug, a.name).localeCompare(exerciseName(b.slug, b.name), "de");
    }),
);

function onCardClick(ex: CatalogExercise) {
  if (props.mode === "select") emit("toggle", ex);
  else emit("open", ex);
}

/** `equipment` comes untyped (`string | null`) off the API boundary, so this falls back to the
 *  raw slug rather than throwing on an unrecognized value — a translation gap should degrade,
 *  not break. */
function equipmentLabel(eq: string | null): string {
  if (!eq) return "—";
  return equipmentRequirementLabelDe(eq as Parameters<typeof equipmentRequirementLabelDe>[0]);
}
</script>

<template>
  <div class="exercise-list">
    <Input
      v-model="search"
      class="search-input"
      type="text"
      :placeholder="t('exerciseUi.list.searchPlaceholder')"
      :aria-label="t('exerciseUi.list.searchAriaLabel')"
    />

    <div class="filters">
      <Select v-model="equipmentFilter" class="filter-select" :aria-label="t('exerciseUi.list.equipmentFilterAriaLabel')">
        <option value="">{{ t("exerciseUi.list.allEquipmentOption") }}</option>
        <option v-for="eq in equipmentOptions" :key="eq" :value="eq">{{ equipmentLabel(eq) }}</option>
      </Select>
      <Select v-model="muscleFilter" class="filter-select" :aria-label="t('exerciseUi.list.muscleFilterAriaLabel')">
        <option value="">{{ t("exerciseUi.list.allMusclesOption") }}</option>
        <option v-for="m in MUSCLE_SLUGS" :key="m" :value="m">{{ muscleLabel(m) }}</option>
      </Select>
    </div>

    <Chip
      v-if="hasEquipmentFilter"
      as="button"
      class="equipment-toggle"
      :active="onlyDoableEquipment"
      @click="onlyDoableEquipment = !onlyDoableEquipment"
    >
      <template v-if="onlyDoableEquipment" #leading><AppIcon name="check" /></template>
      {{ t("exerciseUi.list.onlyDoableToggle") }}
    </Chip>

    <div v-if="catalog.loaded && filtered.length === 0" class="empty">
      <EmptyNote v-if="onlyDoableEquipment && hasEquipmentFilter" align="start">
        {{ t("exerciseUi.list.emptyWithFilterHint") }}
      </EmptyNote>
      <EmptyNote v-else align="start">{{ t("exerciseUi.list.emptyPlain") }}</EmptyNote>
      <Button v-if="onlyDoableEquipment && hasEquipmentFilter" variant="secondary" @click="onlyDoableEquipment = false">
        {{ t("exerciseUi.list.disableOnlyDoable") }}
      </Button>
    </div>

    <ul class="ex-grid">
      <li v-for="ex in filtered" :key="ex.id">
        <button
          class="ex-card surface-hybrid"
          :class="{ selected: mode === 'select' && selectedIds.has(ex.id) }"
          @click="onCardClick(ex)"
        >
          <ExerciseRow :slug="ex.slug" :equipment="ex.equipment ?? 'bodyweight'" :name="exerciseName(ex.slug, ex.name)" :size="48">
            <template #meta>
              <span class="equip">{{ equipmentLabel(ex.equipment) }}</span>
              <span v-if="!onlyDoableEquipment && hasEquipmentFilter && missingRequiredFor(ex).length > 0" class="missing-note">
                {{ t("exerciseUi.list.missingNote", { list: missingRequiredFor(ex).map(equipmentRequirementLabelDe).join(", ") }) }}
              </span>
              <span v-if="hasEquipmentFilter && missingRecommendedFor(ex).length > 0" class="recommended-note">
                {{ t("exerciseUi.list.recommendedNote", { list: missingRecommendedFor(ex).map(equipmentRequirementLabelDe).join(", ") }) }}
              </span>
            </template>
          </ExerciseRow>
          <span v-if="mode === 'select' && selectedIds.has(ex.id)" class="check"><AppIcon name="check" /></span>
        </button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.exercise-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.filters {
  display: flex;
  gap: var(--sp2);
}
/* Select's own root is a wrapper div, not the <select> the fallthrough `.filter-select` class
   lands on — so the flex-grow that used to sit directly on the flex child now targets it
   generically by position instead. */
.filters > * {
  flex: 1;
  min-width: 0;
}
.equipment-toggle {
  align-self: flex-start;
}
button.equipment-toggle.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--sp2);
}
.ex-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp2);
}
.ex-card {
  /* .surface-hybrid (tokens.css) supplies the translucent fill, gradient hairline, position,
     backdrop-filter, and box-shadow; this block only adds the layout and interaction bits it
     doesn't. */
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-lg);
  color: var(--text);
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out), filter var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.ex-card:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  /* Was `background: var(--surface-3)` — with .surface-hybrid now supplying the base fill,
     overriding `background` on hover would flatten the card back to opaque right when the user
     is interacting with it. `filter: brightness()` gives the same "lit up" hover feedback
     without fighting the hybrid fill or its backdrop-filter blur. */
  .ex-card:hover {
    filter: brightness(1.12);
  }
}
.ex-card.selected {
  /* Deliberate exception, not a flat-surface leftover: "selected" is an accent STATE (wizard
     picker), not a neutral panel background, so it stays the existing opaque --blue-lo treatment
     rather than adopting the hybrid neutral fill — same reasoning as .equipment-toggle.active
     below and the app's other active/selected chip states. */
  background: var(--blue-lo);
  border: 1px solid var(--blue);
}
/* No entrance stagger: this list re-renders on every keystroke in the search input above
   (`filtered` is a computed keyed off `search`), so a stagger would replay for the first
   screenful on every character typed. */
.equip {
  font-size: 11px;
  color: var(--dim);
  text-transform: capitalize;
}
.missing-note {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--warning-hi);
}
.recommended-note {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--faint);
}
.check {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--blue);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
  display: grid;
  place-items: center;
  /* --ease-out, not --ease-spring: this is a plain tap-to-select checkmark, not an earned
     moment (rank-up/PR/level-up) per motion.css's own convention. */
  animation: pop-in var(--dur-fast) var(--ease-out) both;
}
</style>
