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
import { EXERCISE_SLUG_PATTERN } from "@liftr/shared";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS } from "../../lib/equipmentIcons";
import { MUSCLE_LABEL_DE, MUSCLE_SLUGS } from "../../lib/muscles";
import { createExercise } from "../../services/exerciseService";
import { useCatalogStore } from "../../stores/catalogStore";

const emit = defineEmits<{ created: []; cancel: [] }>();

const catalog = useCatalogStore();

const displayName = ref("");
const equipment = ref<string>("");
const isBodyweight = ref(false);
const movementPattern = ref("squat");
const primaryMuscle = ref("");
const secondaryMuscles = ref<Set<string>>(new Set());
const saving = ref(false);
const errorMsg = ref("");

const MOVEMENT_PATTERNS: { value: string; label: string }[] = [
  { value: "squat", label: "Kniebeuge" },
  { value: "hinge", label: "Hüftbeuge" },
  { value: "push-horizontal", label: "Drücken, horizontal" },
  { value: "push-vertical", label: "Drücken, vertikal" },
  { value: "pull-horizontal", label: "Ziehen, horizontal" },
  { value: "pull-vertical", label: "Ziehen, vertikal" },
  { value: "carry", label: "Tragen" },
  /* The catalog's movement-pattern vocabulary for isolation work uses these six
     muscle-group-qualified values (tools/catalog/curated.yaml); a bare "isolation" value matches
     no catalog exercise, which would exclude custom isolation exercises from findSubstitute's
     movement-pattern matching. */
  { value: "isolation-arms", label: "Isolation (Arme)" },
  { value: "isolation-core", label: "Isolation (Rumpf)" },
  { value: "isolation-shoulders", label: "Isolation (Schultern)" },
  { value: "isolation-legs", label: "Isolation (Beine)" },
  { value: "isolation-chest", label: "Isolation (Brust)" },
  { value: "isolation-back", label: "Isolation (Rücken)" },
];

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
    errorMsg.value = "Speichern fehlgeschlagen — prüfe, ob der Name bereits vergeben ist.";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="add-exercise-form">
    <label class="field">
      <span class="field-label">Name</span>
      <input v-model="displayName" type="text" placeholder="z. B. Kabelzug Facepull" />
      <span v-if="slug" class="slug-preview">wird gespeichert als: {{ slug }}</span>
    </label>

    <label class="field">
      <span class="field-label">Bewegungsmuster</span>
      <select v-model="movementPattern">
        <option v-for="p in MOVEMENT_PATTERNS" :key="p.value" :value="p.value">{{ p.label }}</option>
      </select>
    </label>

    <label class="field checkbox-field">
      <input v-model="isBodyweight" type="checkbox" />
      <span>Eigengewichtsübung</span>
    </label>

    <label v-if="!isBodyweight" class="field">
      <span class="field-label">Gerät</span>
      <select v-model="equipment">
        <option value="">Kein primäres Gerät</option>
        <option v-for="eq in EQUIPMENT_SLUGS" :key="eq" :value="eq">{{ EQUIPMENT_LABEL_DE[eq] }}</option>
      </select>
    </label>

    <div class="field">
      <span class="field-label">Hauptmuskel</span>
      <div class="chip-grid">
        <button
          v-for="m in MUSCLE_SLUGS"
          :key="m"
          type="button"
          class="muscle-chip"
          :class="{ active: primaryMuscle === m }"
          @click="primaryMuscle = m"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </button>
      </div>
    </div>

    <div class="field">
      <span class="field-label">Weitere Muskeln (optional)</span>
      <div class="chip-grid">
        <button
          v-for="m in MUSCLE_SLUGS.filter((s) => s !== primaryMuscle)"
          :key="m"
          type="button"
          class="muscle-chip"
          :class="{ active: secondaryMuscles.has(m) }"
          @click="toggleSecondary(m)"
        >
          {{ MUSCLE_LABEL_DE[m] ?? m }}
        </button>
      </div>
    </div>

    <p v-if="errorMsg" class="error-msg">{{ errorMsg }}</p>

    <div class="actions">
      <button class="btn-secondary" @click="emit('cancel')">Abbrechen</button>
      <button class="btn-primary" :disabled="!canSave" @click="save">
        {{ saving ? "Wird gespeichert…" : "Übung speichern" }}
      </button>
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
.field input[type="text"],
.field select {
  padding: 10px 14px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
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
.muscle-chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
}
.muscle-chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
.error-msg {
  color: var(--red);
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
