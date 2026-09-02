<script setup lang="ts">
/** Step 0 (create mode only) — engagement-audit-v4 Phase 1: the manual-vs-muscle-guided choice
 *  used to be a segmented toggle buried inside PickStep, easy to miss and easy to read as "one
 *  mode is the real one, the other is a fallback" (the interview's own complaint: the
 *  muscle-guided path "makes the other way of creating basically obsolete, even though it
 *  shouldn't"). Making it an explicit first decision gives both paths equal visual weight before
 *  either one starts, then both converge into the same Pick/Arrange/Review steps after. Edit mode
 *  never reaches this screen — it jumps straight to Arrange since exercises already exist. */
defineEmits<{ choose: [mode: "manual" | "muscles"] }>();
</script>

<template>
  <div class="path-chooser">
    <button class="path-card" @click="$emit('choose', 'manual')">
      <span class="path-title">Selbst zusammenstellen</span>
      <span class="path-desc">Übungen aus der Liste wählen und Sätze, Wiederholungen und Gewicht selbst festlegen.</span>
    </button>
    <button class="path-card" @click="$emit('choose', 'muscles')">
      <span class="path-title">Nach Muskelgruppe vorschlagen lassen</span>
      <span class="path-desc">
        Muskelgruppen wählen — Liftr stellt passende Übungen zusammen, mit Sätzen, Wiederholungen und Gewicht, die zu deinem bisherigen Training passen.
      </span>
    </button>
  </div>
</template>

<style scoped>
.path-chooser {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
}
.path-card {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--sp4);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line);
  text-align: left;
}
.path-card:active {
  border-color: var(--line-2);
}
.path-title {
  font-size: 15px;
  font-weight: 800;
  color: var(--text);
}
.path-desc {
  font-size: 12.5px;
  color: var(--dim);
}
</style>
