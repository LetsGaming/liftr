<!-- packages/client/src/pages/RecordsPage.vue -->
<script setup lang="ts">
// Personal Records ledger (workplan-v1 §2 / nebula-design-layout.md §3). Reads `prs`, a table the
// server already fully populates on every workout finish and, until this page, never displayed.
// Honest empty state, no locked/teaser treatment (engagement-audit-v5.md §1.2's boundary).
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted } from "vue";
import { useExerciseName } from "../composables/useExerciseName";
import { usePrStore } from "../stores/prStore";

const prStore = usePrStore();
const { exerciseName } = useExerciseName();
onMounted(() => void prStore.load());

const KIND_LABEL: Record<string, string> = {
  e1rm: "e1RM",
  weight: "Gewicht",
  reps: "Wiederholungen",
  volume: "Volumen",
};

const sorted = computed(() => prStore.prs.slice().sort((a, b) => b.achievedAt.localeCompare(a.achievedAt)));

function formatValue(kind: string, value: number): string {
  if (kind === "reps") return `${Math.round(value)} Wdh.`;
  if (kind === "volume") return `${Math.round(value).toLocaleString("de-DE")} kg`;
  return `${value} kg`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" });
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Rekorde</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
      <p style="color: var(--dim)">Deine besten Sätze pro Übung — automatisch erfasst, nie verpasst.</p>

      <template v-if="!prStore.loaded && !prStore.error">
        <div v-for="i in 4" :key="i" class="shimmer pr-skel-row" aria-hidden="true" />
      </template>

      <p v-else-if="prStore.error" class="page-note load-error" style="margin-top: var(--sp4)">
        Rekorde konnten nicht geladen werden.
        <button type="button" class="btn-secondary" @click="prStore.load()">Erneut versuchen</button>
      </p>

      <p v-else-if="sorted.length === 0" class="page-note" style="margin-top: var(--sp4)">
        Noch keine Rekorde — dein erster harter Satz auf einer beliebigen Übung startet einen.
      </p>

      <ul v-else class="pr-list">
        <li v-for="pr in sorted" :key="pr.id" class="panel pr-row">
          <div class="pr-row-main">
            <b>{{ exerciseName(pr.exerciseSlug) }}</b>
            <span class="pr-kind">{{ KIND_LABEL[pr.kind] }}</span>
          </div>
          <div class="pr-row-meta">
            <span class="tnum pr-value">{{ formatValue(pr.kind, pr.value) }}</span>
            <span class="pr-date">{{ formatDate(pr.achievedAt) }}</span>
          </div>
        </li>
      </ul>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.page-note {
  color: var(--dim);
}
.load-error {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--sp3);
  max-width: 60ch;
}
.load-error .btn-secondary {
  padding: 8px 14px;
}
.pr-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp4);
}
.pr-row {
  padding: var(--sp4);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp3);
}
.pr-row-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.pr-kind {
  font-size: 12px;
  color: var(--dim);
}
.pr-row-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  flex: none;
}
.pr-value {
  font-weight: 800;
}
.pr-date {
  font-size: 12px;
  color: var(--faint);
}
.pr-skel-row {
  height: 56px;
  border-radius: var(--r-lg);
  margin-top: var(--sp3);
}
</style>
