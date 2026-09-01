<script setup lang="ts">
/**
 * Filterable/searchable exercise list — search + equipment/muscle filters + thumbnail cards.
 * Extracted out of ExercisesPage.vue (the library tab) so the routine wizard's exercise picker
 * (PickStep.vue) reuses the exact same list instead of a second, drifting implementation. Two
 * modes on the same markup:
 *   - "browse" (the library tab): tap a card to open its info sheet.
 *   - "select" (the wizard): tap toggles membership in the caller's selection; selected cards
 *     get a checkmark badge + highlighted border so "what's picked" is visible at a glance
 *     alongside "what is this exercise" (the thumbnail).
 */
import { canPerform, missingByTier, type EquipmentRequirement, type TieredRequirement } from "@liftr/shared";
import { computed, ref } from "vue";
import { useExerciseName } from "../../composables/useExerciseName";
import { EQUIPMENT_LABEL_DE, equipmentRequirementLabelDe, type Equipment } from "../../lib/equipmentIcons";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import { useCatalogStore, type CatalogExercise } from "../../stores/catalogStore";
import { useSettingsStore } from "../../stores/settingsStore";
import ExerciseRow from "./ExerciseRow.vue";

const props = withDefaults(defineProps<{ mode?: "browse" | "select"; selectedIds?: Set<string> }>(), {
  mode: "browse",
  selectedIds: () => new Set(),
});
const emit = defineEmits<{ open: [exercise: CatalogExercise]; toggle: [exercise: CatalogExercise] }>();

const catalog = useCatalogStore();
const settingsStore = useSettingsStore();
const { exerciseName } = useExerciseName();

const search = ref("");
const equipmentFilter = ref("");
const muscleFilter = ref("");
// Feature: "we don't want to show the user exercises they can't actually do with their
// equipment" — defaults ON in "browse" mode (unlike the old single-tag version of this toggle),
// since that's the actually-useful default for the accuracy this feature is about. Defaults OFF
// in "select" mode (the routine wizard's manual picker) — manual picking stays deliberate, the
// user might be at a different gym today, so an unusable exercise is marked + deprioritized in
// the sort below rather than hidden outright. Either way, only offered/applied once there's
// actually an owned-equipment list to filter by (an unset/empty list means "no restriction
// configured", not "owns nothing"), and uses the full requiredEquipment list via canPerform, not
// just the one primary `equipment` tag the old naive check compared.
const onlyDoableEquipment = ref(props.mode !== "select");
const hasEquipmentFilter = computed(() => !!settingsStore.ownedEquipment && settingsStore.ownedEquipment.length > 0);

const equipmentOptions = computed(() => [...new Set(catalog.exercises.map((e) => e.equipment).filter((e): e is string => !!e))].sort());

function requirementsFor(e: CatalogExercise): TieredRequirement[] {
  const list = e.requiredEquipment;
  if (list && list.length > 0) return list;
  return e.equipment ? [{ item: e.equipment as EquipmentRequirement, tier: "required" as const }] : [];
}
// Feature: "there should be tiers — this would allow exercises that only miss a mat to not be
// filtered out." Only `required` misses gate the toggle/sort below; `recommended` misses are
// shown as a lighter hint regardless of the toggle, since they never make the exercise undoable.
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
      if (q && !(e.slug.toLowerCase().includes(q) || exerciseName(e.slug).toLowerCase().includes(q))) return false;
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
      return exerciseName(a.slug).localeCompare(exerciseName(b.slug), "de");
    }),
);

function onCardClick(ex: CatalogExercise) {
  if (props.mode === "select") emit("toggle", ex);
  else emit("open", ex);
}

/** Was `{{ eq }}` (critique finding: raw English equipment slugs — "chest", "barbell" — rendered
 *  directly into a German-language UI). EQUIPMENT_LABEL_DE already exists and is used elsewhere
 *  (ExerciseInfoPanel, onboarding); this was simply never wired in here. `equipment` comes
 *  untyped (`string | null`) off the API boundary, so this falls back to the raw slug rather
 *  than throwing on an unrecognized value — a translation gap should degrade, not break. */
function equipmentLabel(eq: string | null): string {
  if (!eq) return "—";
  return EQUIPMENT_LABEL_DE[eq as Equipment] ?? eq;
}
</script>

<template>
  <div class="exercise-list">
    <input v-model="search" class="search-input" type="text" placeholder="Übung suchen…" aria-label="Übung suchen" />

    <div class="filters">
      <select v-model="equipmentFilter" class="filter-select" aria-label="Nach Gerät filtern">
        <option value="">Alle Geräte</option>
        <option v-for="eq in equipmentOptions" :key="eq" :value="eq">{{ equipmentLabel(eq) }}</option>
      </select>
      <select v-model="muscleFilter" class="filter-select" aria-label="Nach Muskelgruppe filtern">
        <option value="">Alle Muskeln</option>
        <option v-for="m in MUSCLE_SLUGS" :key="m" :value="m">{{ MUSCLE_LABEL_DE[m] ?? m }}</option>
      </select>
    </div>

    <button
      v-if="hasEquipmentFilter"
      class="equipment-toggle"
      :class="{ active: onlyDoableEquipment }"
      @click="onlyDoableEquipment = !onlyDoableEquipment"
    >
      {{ onlyDoableEquipment ? "✓ Nur machbare Übungen" : "Nur machbare Übungen" }}
    </button>

    <p v-if="catalog.loaded && filtered.length === 0" class="empty">Keine Übungen gefunden.</p>

    <ul class="ex-grid">
      <li v-for="ex in filtered" :key="ex.id">
        <button class="ex-card" :class="{ selected: mode === 'select' && selectedIds.has(ex.id) }" @click="onCardClick(ex)">
          <ExerciseRow :slug="ex.slug" :equipment="ex.equipment ?? 'bodyweight'" :name="exerciseName(ex.slug)" :size="48">
            <template #meta>
              <span class="equip">{{ equipmentLabel(ex.equipment) }}</span>
              <span v-if="!onlyDoableEquipment && hasEquipmentFilter && missingRequiredFor(ex).length > 0" class="missing-note">
                fehlt: {{ missingRequiredFor(ex).map(equipmentRequirementLabelDe).join(", ") }}
              </span>
              <span v-if="hasEquipmentFilter && missingRecommendedFor(ex).length > 0" class="recommended-note">
                empfohlen: {{ missingRecommendedFor(ex).map(equipmentRequirementLabelDe).join(", ") }}
              </span>
            </template>
          </ExerciseRow>
          <span v-if="mode === 'select' && selectedIds.has(ex.id)" class="check">✓</span>
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
.search-input {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.filters {
  display: flex;
  gap: var(--sp2);
}
.filter-select {
  flex: 1;
  padding: 8px 10px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 13px;
}
.equipment-toggle {
  align-self: flex-start;
  padding: 7px 12px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 12.5px;
  font-weight: 600;
}
.equipment-toggle.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
.empty {
  color: var(--dim);
}
.ex-grid {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: var(--sp2);
}
.ex-card {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--sp3);
  padding: var(--sp3);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  text-align: left;
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.ex-card:active {
  transform: scale(0.98);
}
@media (hover: hover) {
  .ex-card:hover {
    background: var(--surface-3);
  }
}
.ex-card.selected {
  background: var(--blue-lo);
  border-color: var(--blue);
}
/* Entrance stagger for the first screenful (feedback: the rest of the app was still missing
   the dashboard's liveliness) — capped at a handful of items so re-filtering a long list
   doesn't replay a huge cascade every keystroke. */
.ex-grid > li {
  /* --ease-out, not --ease-spring: the overshoot easing is reserved for earned moments
     (rank-up, PR, level-up) per motion.css's own convention — a list entrance isn't one of
     those (see commit 8c0f158 for the same fix elsewhere). */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
.ex-grid > li:nth-child(1) {
  animation-delay: 0ms;
}
.ex-grid > li:nth-child(2) {
  animation-delay: 30ms;
}
.ex-grid > li:nth-child(3) {
  animation-delay: 60ms;
}
.ex-grid > li:nth-child(4) {
  animation-delay: 90ms;
}
.ex-grid > li:nth-child(n + 5) {
  animation-delay: 120ms;
}
.equip {
  font-size: 11px;
  color: var(--dim);
  text-transform: capitalize;
}
.missing-note {
  font-size: 10.5px;
  font-weight: 700;
  color: var(--fire-hi);
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
