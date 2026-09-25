<script setup lang="ts">
// Attributions page — required by license for every ingested third-party source. Content is
// static except for one noted exception (OpenRouteService), which is a live per-request call
// rather than an ingest-once source — see the intro paragraph below.
//
// Not reachable from any nav item — same "reachable, not surfaced" shape as DiagnosticsPage.vue
// — so it needs BasePage's back-button to have any way out.
import { useI18n } from "vue-i18n";
import BasePage from "../components/patterns/BasePage.vue";

const { t } = useI18n();
</script>

<template>
  <BasePage :title="t('attributionsPage.title')" back-button>
    <div class="attributions-content">
      <p style="color: var(--dim)">
        {{ t("attributionsPage.intro") }}
      </p>

      <ul class="sources">
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.wger.name") }}</b> — {{ t("attributionsPage.wger.desc") }}
          <span class="license">{{ t("attributionsPage.wger.license") }}</span>
          <p>{{ t("attributionsPage.wger.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.wgerPhotos.name") }}</b> — {{ t("attributionsPage.wgerPhotos.desc") }}
          <span class="license">{{ t("attributionsPage.wgerPhotos.license") }}</span>
          <p>{{ t("attributionsPage.wgerPhotos.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.muscleDiagram.name") }}</b> — {{ t("attributionsPage.muscleDiagram.desc") }}
          <span class="license">{{ t("attributionsPage.muscleDiagram.license") }}</span>
          <p>{{ t("attributionsPage.muscleDiagram.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.freeExerciseDb.name") }}</b> — {{ t("attributionsPage.freeExerciseDb.desc") }}
          <span class="license">{{ t("attributionsPage.freeExerciseDb.license") }}</span>
          <p>{{ t("attributionsPage.freeExerciseDb.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.openPowerlifting.name") }}</b> — {{ t("attributionsPage.openPowerlifting.desc") }}
          <span class="license">{{ t("attributionsPage.openPowerlifting.license") }}</span>
          <p>{{ t("attributionsPage.openPowerlifting.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.openStreetMap.name") }}</b> — {{ t("attributionsPage.openStreetMap.desc") }}
          <span class="license">{{ t("attributionsPage.openStreetMap.license") }}</span>
          <p>{{ t("attributionsPage.openStreetMap.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.esri.name") }}</b> — {{ t("attributionsPage.esri.desc") }}
          <span class="license">{{ t("attributionsPage.esri.license") }}</span>
          <p>{{ t("attributionsPage.esri.credit") }}</p>
        </li>
        <li class="surface-hybrid">
          <b>{{ t("attributionsPage.openRouteService.name") }}</b> — {{ t("attributionsPage.openRouteService.desc") }}
          <span class="license">{{ t("attributionsPage.openRouteService.license") }}</span>
          <p>{{ t("attributionsPage.openRouteService.credit") }}</p>
        </li>
      </ul>
    </div>
  </BasePage>
</template>

<style scoped>
/* Every tab standardizes on one of the four --content-w-* tiers (see tokens.css); this is a
   single-column reading list, same shape as Profil's settings column, so it gets the same
   "narrow" tier. */
.attributions-content {
  max-width: var(--content-w-narrow);
  margin: 0 auto;
}
.sources {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  margin-top: var(--sp5);
}
/* `.surface-hybrid` (template, tokens.css) supplies background/blur/shadow/hairline for these
   rows; only radius/padding stay local here. */
.sources li {
  border-radius: var(--r-lg);
  padding: var(--sp4);
}
.license {
  display: inline-block;
  margin-left: var(--sp2);
  font-size: 11px;
  font-weight: 700;
  color: var(--dim);
  background: var(--surface-3);
  padding: 2px 8px;
  border-radius: 999px;
}
.sources p {
  font-size: 12px;
  color: var(--faint);
  margin-top: 4px;
}
</style>
