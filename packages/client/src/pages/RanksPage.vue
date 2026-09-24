<script setup lang="ts">
// Ränge: tiered rank cards + next-target, powered by @liftr/shared's resolveRank/nextLoadTarget
// running server-side (see rankEngine.ts) and cached into the `ranks` table. Never
// gated/paywalled.
//
// Kraft and Lauf ranks used to stack as two full sections on one long scroll (hero ladder,
// analytics, grid — each duplicated), so reaching your running rank meant scrolling past a
// 30+ card strength grid first. Split into local sub-tabs instead, sharing TabSwitcher.vue with
// WorkoutPage.vue/RunsPage.vue's Workout↔Läufe switcher (Jakob's Law — reuse a pattern users
// already know). No `to` on either tab here, since Kraft/Lauf are two views of one /ranks route,
// not two real routes — TabSwitcher renders local-toggle buttons instead of RouterLinks in that
// case. Section content itself lives in RankLifterSection.vue/RankRunnerSection.vue.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { ref } from "vue";
import AppIcon from "../components/ui/AppIcon.vue";
import Button from "../components/base/Button.vue";
import RankLifterSection from "../components/rank/RankLifterSection.vue";
import RankRunnerSection from "../components/rank/RankRunnerSection.vue";
import TabSwitcher, { type TabSwitcherTab } from "../components/ui/TabSwitcher.vue";

const section = ref<"workout" | "Läufe">("workout");
const RANK_TABS: TabSwitcherTab[] = [
  { id: "workout", label: "Workout" },
  { id: "Läufe", label: "Läufe" },
];
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Ränge</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
        <TabSwitcher
          :tabs="RANK_TABS"
          :model-value="section"
          nav-label="Workout- oder Lauf-Ränge"
          @update:model-value="section = $event as 'workout' | 'Läufe'"
        />
        <Button as="router-link" to="/records" variant="secondary">
          <template #leading><AppIcon name="trophy" /></template>
          Rekorde ansehen
        </Button>
      <RankLifterSection v-if="section === 'workout'" />
      <RankRunnerSection v-else />
    </IonContent>
  </IonPage>
</template>
