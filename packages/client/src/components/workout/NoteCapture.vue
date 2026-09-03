<script setup lang="ts">
/**
 * Notes capture (Task 5, workstream A) — shared shape for both set- and workout-level notes,
 * parameterized rather than two near-duplicate components (set notes: WorkoutPage.vue's per-set
 * affordance writing store.currentSet.notes; workout notes: the rail-column affordance writing
 * store.workoutNotes). Same "explicitly speculative, off the primary path" framing as
 * RpeCapture.vue — no required state, closing without saving is a silent no-op.
 *
 * Free-text needs a text area, which doesn't fit SheetModal's smallest heights well — taller
 * sheet than RpeCapture.vue's, same fixed-percentage convention as SetKindPicker.vue rather than
 * content-driven sizing.
 */
import { ref } from "vue";
import SheetModal from "../ui/SheetModal.vue";

const props = defineProps<{ title: string; modelValue: string | null }>();
const emit = defineEmits<{ save: [value: string | null]; close: [] }>();

const draft = ref(props.modelValue ?? "");

function onSave() {
  const trimmed = draft.value.trim();
  emit("save", trimmed.length > 0 ? trimmed : null);
}
</script>

<template>
  <SheetModal :title="props.title" height="50%" @close="emit('close')">
    <textarea v-model="draft" class="note-textarea" rows="6" placeholder="Notiz…" />
    <button class="btn-primary btn-block note-save" @click="onSave">Speichern</button>
  </SheetModal>
</template>

<style scoped>
.note-textarea {
  width: 100%;
  flex: 1;
  min-height: 120px;
  padding: var(--sp3) var(--sp4);
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}
.note-save {
  margin-top: var(--sp3);
}
</style>
