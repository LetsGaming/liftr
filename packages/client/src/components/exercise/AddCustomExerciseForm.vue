<script setup lang="ts">
/**
 * The slug is derived from the typed display name (lowercased, non-alphanumeric runs collapsed to
 * hyphens) and used only as the exercise's stable lookup key — the typed `displayName` is sent as
 * `name` and displayed verbatim (see useExerciseName.ts).
 *
 * EXERCISE_SLUG_PATTERN is reused from @liftr/shared (packages/shared/src/catalog/slug.ts), the
 * same pattern the server validates against in routes/exercises.ts, to avoid regex drift. The
 * slug computed below is already lowercase-alphanumeric-hyphen, so this check only catches an
 * edge case like an all-symbol name collapsing to an empty slug; the server's 400 response
 * remains the final authority.
 */
import { computed, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { EXERCISE_SLUG_PATTERN } from "@liftr/shared";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS } from "../../lib/equipmentIcons";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import { createExercise } from "../../services/exerciseService";
import { useCatalogStore } from "../../stores/catalogStore";
import Chip from "../base/Chip.vue";
import Input from "../base/Input.vue";
import Select from "../base/Select.vue";
import Button from "../base/Button.vue";

const emit = defineEmits<{ created: []; cancel: [] }>();

const { t } = useI18n();
const catalog = useCatalogStore();

const displayName = ref("");
const equipment = ref<string>("");
const isBodyweight = ref(false);
const movementPattern = ref("squat");
const primaryMuscle = ref("");
const secondaryMuscles = ref<Set<string>>(new Set());
const saving = ref(false);
const errorMsg = ref("");

const MOVEMENT_PATTERNS = computed<{ value: string; label: string }[]>(() => [
  { value: "squat", label: t("exerciseUi.addCustomForm.movementPatterns.squat") },
  { value: "hinge", label: t("exerciseUi.addCustomForm.movementPatterns.hinge") },
  { value: "push-horizontal", label: t("exerciseUi.addCustomForm.movementPatterns.pushHorizontal") },
  { value: "push-vertical", label: t("exerciseUi.addCustomForm.movementPatterns.pushVertical") },
  { value: "pull-horizontal", label: t("exerciseUi.addCustomForm.movementPatterns.pullHorizontal") },
  { value: "pull-vertical", label: t("exerciseUi.addCustomForm.movementPatterns.pullVertical") },
  { value: "carry", label: t("exerciseUi.addCustomForm.movementPatterns.carry") },
  /* The catalog's movement-pattern vocabulary for isolation work uses these six
     muscle-group-qualified values (tools/catalog/curated.yaml); a bare "isolation" value matches
     no catalog exercise, which would exclude custom isolation exercises from findSubstitute's
     movement-pattern matching. */
  { value: "isolation-arms", label: t("exerciseUi.addCustomForm.movementPatterns.isolationArms") },
  { value: "isolation-core", label: t("exerciseUi.addCustomForm.movementPatterns.isolationCore") },
  { value: "isolation-shoulders", label: t("exerciseUi.addCustomForm.movementPatterns.isolationShoulders") },
  { value: "isolation-legs", label: t("exerciseUi.addCustomForm.movementPatterns.isolationLegs") },
  { value: "isolation-chest", label: t("exerciseUi.addCustomForm.movementPatterns.isolationChest") },
  { value: "isolation-back", label: t("exerciseUi.addCustomForm.movementPatterns.isolationBack") },
]);

/* German umlauts and ß have no transliteration before the non-alphanumeric collapse below, so
   e.g. "Bankdrücken" would become "bankdr-cken". The slug is only a lookup key (the typed name is
   sent verbatim as `name`, see save() below), but since it's permanent with no edit path, this
   step avoids a mangled slug. */
function transliterateGerman(s: string): string {
  return s
    .replace(/ä/gi, (m) => (m === "Ä" ? "Ae" : "ae"))
    .replace(/ö/gi, (m) => (m === "Ö" ? "Oe" : "oe"))
    .replace(/ü/gi, (m) => (m === "Ü" ? "Ue" : "ue"))
    .replace(/ß/g, "ss");
}

const slug = computed(() =>
  transliterateGerman(displayName.value.trim())
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, ""),
);

const canSave = computed(
  () => slug.value.length > 0 && EXERCISE_SLUG_PATTERN.test(slug.value) && primaryMuscle.value !== "" && !saving.value,
);

/* Clear equipment when isBodyweight is checked, so a bodyweight exercise doesn't submit stale
   equipment (e.g. "barbell" picked earlier). "" is the "no equipment" sentinel — the select's own
   default option. */
watch(isBodyweight, (bodyweight) => {
  if (bodyweight) equipment.value = "";
});

function toggleSecondary(slugValue: string) {
  if (secondaryMuscles.value.has(slugValue)) secondaryMuscles.value.delete(slugValue);
  else secondaryMuscles.value.add(slugValue);
}

async function save() {
  if (!canSave.value) return;
  saving.value = true;
  errorMsg.value = "";
  try {
    const muscleSlugs = [
      { slug: primaryMuscle.value, role: "primary" as const },
      ...[...secondaryMuscles.value].map((s) => ({ slug: s, role: "secondary" as const })),
    ];
    await createExercise({
      slug: slug.value,
      name: displayName.value.trim(),
      equipment: equipment.value || undefined,
      movementPattern: movementPattern.value,
      isBodyweight: isBodyweight.value,
      muscleSlugs,
    });
    await catalog.load();
    emit("created");
  } catch {
    errorMsg.value = t("exerciseUi.addCustomForm.errorSaveFailed");
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="add-exercise-form">
    <label class="field">
      <span class="field-label">{{ t("exerciseUi.addCustomForm.nameLabel") }}</span>
      <Input v-model="displayName" type="text" :placeholder="t('exerciseUi.addCustomForm.namePlaceholder')" />
      <span v-if="slug" class="slug-preview">{{ t("exerciseUi.addCustomForm.slugPreview", { slug }) }}</span>
    </label>

    <label class="field">
      <span class="field-label">{{ t("exerciseUi.addCustomForm.movementPatternLabel") }}</span>
      <Select v-model="movementPattern">
        <option v-for="p in MOVEMENT_PATTERNS" :key="p.value" :value="p.value">{{ p.label }}</option>
      </Select>
    </label>

    <label class="field checkbox-field">
      <input v-model="isBodyweight" type="checkbox" />
      <span>{{ t("exerciseUi.addCustomForm.bodyweightLabel") }}</span>
    </label>

    <label v-if="!isBodyweight" class="field">
      <span class="field-label">{{ t("exerciseUi.addCustomForm.equipmentLabel") }}</span>
      <Select v-model="equipment">
        <option value="">{{ t("exerciseUi.addCustomForm.noEquipmentOption") }}</option>
        <option v-for="eq in EQUIPMENT_SLUGS" :key="eq" :value="eq">{{ EQUIPMENT_LABEL_DE[eq] }}</option>
      </Select>
    </label>

    <div class="field">
      <span class="field-label">{{ t("exerciseUi.addCustomForm.primaryMuscleLabel") }}</span>
      <div class="chip-grid">
        <Chip
          v-for="m in MUSCLE_SLUGS"
          :key="m"
          as="button"
          class="muscle-chip"
          :active="primaryMuscle === m"
          @click="primaryMuscle = m"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </Chip>
      </div>
    </div>

    <div class="field">
      <span class="field-label">{{ t("exerciseUi.addCustomForm.secondaryMusclesLabel") }}</span>
      <div class="chip-grid">
        <Chip
          v-for="m in MUSCLE_SLUGS.filter((s) => s !== primaryMuscle)"
          :key="m"
          as="button"
          class="muscle-chip"
          :active="secondaryMuscles.has(m)"
          @click="toggleSecondary(m)"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </Chip>
      </div>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="actions">
      <Button variant="secondary" @click="emit('cancel')">{{ t("exerciseUi.addCustomForm.cancel") }}</Button>
      <Button variant="primary" :disabled="!canSave" @click="save">
        {{ saving ? t("common.savingEllipsis") : t("exerciseUi.addCustomForm.save") }}
      </Button>
    </div>
  </div>
</template>

<style scoped>
.add-exercise-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp4);
  padding: var(--sp4);
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.field-label {
  font-size: 12.5px;
  color: var(--dim);
  font-weight: 600;
}
.slug-preview {
  font-size: 11px;
  color: var(--faint);
}
.checkbox-field {
  flex-direction: row;
  align-items: center;
  gap: var(--sp2);
}
.chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp2);
}
button.muscle-chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
}
.error-msg {
  color: var(--danger);
  font-size: 12.5px;
}
.actions {
  display: flex;
  gap: var(--sp2);
}
.actions .btn-secondary {
  flex: none;
}
.actions .btn-primary {
  flex: 1;
}
</style>
