<script setup lang="ts">
// Ränge: tiered rank cards + next-target, powered by @liftr/shared's resolveRank/nextLoadTarget
// running server-side (see rankEngine.ts) and cached into the `ranks` table. Never
// gated/paywalled.
//
// Kraft and Lauf ranks used to stack as two full sections on one long scroll (hero ladder,
// analytics, grid: each duplicated), so reaching your running rank meant scrolling past a
// 30+ card strength grid first. Split into local sub-tabs instead, sharing TabSwitcher.vue with
// WorkoutPage.vue/RunsPage.vue's Workout↔Läufe switcher (Jakob's Law: reuse a pattern users
// already know). No `to` on either tab here, since Kraft/Lauf are two views of one /ranks route,
// not two real routes: TabSwitcher renders local-toggle buttons instead of RouterLinks in that
// case. Section content itself lives in RankLifterSection.vue/RankRunnerSection.vue.
import { computed, ref } from "vue";
import { useI18n } from "vue-i18n";
import AppIcon from "../components/base/AppIcon.vue";
import BasePage from "../components/patterns/BasePage.vue";
import RankLifterSection from "../components/rank/RankLifterSection.vue";
import RankRunnerSection from "../components/rank/RankRunnerSection.vue";
import TabSwitcher, { type TabSwitcherTab } from "../components/patterns/TabSwitcher.vue";

const { t } = useI18n();

const section = ref<"workout" | "Läufe">("workout");
const RANK_TABS = computed<TabSwitcherTab[]>(() => [
  { id: "workout", label: t("common.workout") },
  { id: "Läufe", label: t("nav.runs") },
]);
</script>

<template>
  <BasePage :title="t('nav.ranks')">
    <template #subheader>
      <div class="ranks-subheader-row">
        <TabSwitcher
          :tabs="RANK_TABS"
          :model-value="section"
          :nav-label="t('ranksPage.navLabel')"
          @update:model-value="section = $event as 'workout' | 'Läufe'"
        />
        <router-link to="/records" class="ranks-records-link">
          <AppIcon name="trophy" :size="14" />
          {{ t("ranksPage.viewRecords") }}
        </router-link>
      </div>
    </template>
    <RankLifterSection v-if="section === 'workout'" />
    <RankRunnerSection v-else />
  </BasePage>
</template>

<style scoped>
/* Tabs + records CTA share one subheader row instead of the CTA sitting as its own full-width
   content-flow button above the tier ladder: that used to stack a third header-height row
   (title, tabs, button) before any real content, wasting a lot of the viewport on mobile. */
.ranks-subheader-row {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.ranks-records-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  align-self: flex-start;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--dim);
}
</style>
