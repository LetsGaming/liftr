<script setup lang="ts">
/**
 * Route Overview screen — the running-side counterpart to RoutineOverviewPage.vue, reached by
 * tapping a route card instead of starting immediately (see RouteList.vue's openOverview()).
 * Same "drill-in screen, sticky start bar, no nav-bar entry of its own" shape; the two genuine
 * differences from the workout side are what there is to preview (a map instead of an exercise
 * list) and what "starting" means (a choice between live GPS tracking and manual entry, instead
 * of one unconditional start).
 */
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppIcon from "../components/base/AppIcon.vue";
import Button from "../components/base/Button.vue";
import DrillInScreen from "../components/patterns/DrillInScreen.vue";
import RunMap from "../components/run/RunMap.vue";
import LiveRunScreen from "../components/run/LiveRunScreen.vue";
import { useManualRunEntry } from "../composables/useManualRunEntry";
import { usePlannedRouteStore } from "../stores/plannedRouteStore";

const route = useRoute();
const router = useRouter();
const plannedRouteStore = usePlannedRouteStore();

const routeId = computed(() => route.params.id as string);
const plannedRoute = computed(() => plannedRouteStore.byId(routeId.value));

onMounted(() => {
  if (!plannedRouteStore.loaded) void plannedRouteStore.load();
  // Deep-link from RouteList.vue's card "Starten" button (RunsPage.vue), same pattern as
  // ProfilePage.vue's `?focus=account-app` — reuses this page's own live-tracking wiring instead
  // of duplicating LiveRunScreen's invocation on the card's page.
  if (route.query.autostart === "live") {
    showLiveRun.value = true;
    void router.replace(`/routes/${routeId.value}`);
  }
});

const showLiveRun = ref(false);
const showManualForm = ref(false);

const { manualDate, manualDistanceKm, manualMinutes, manualError, submitting: loggingManual, submitManual } =
  useManualRunEntry(() => {
    void router.push("/runs");
  });

function openManualForm() {
  const r = plannedRoute.value;
  showManualForm.value = true;
  manualDistanceKm.value = r ? (r.distanceM / 1000).toFixed(2).replace(".", ",") : "";
  manualDate.value = new Date().toISOString().slice(0, 10);
  manualMinutes.value = "";
  manualError.value = null;
}

function saveManual() {
  const r = plannedRoute.value;
  void submitManual({ name: r?.name ?? null, plannedRouteId: r?.id ?? null, elevationGainM: r?.elevationGainM ?? null });
}

function onLiveRunFinished() {
  showLiveRun.value = false;
  void router.push("/runs");
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>{{ plannedRoute ? plannedRoute.name : "Strecke" }}</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding" :scroll-y="false">
      <DrillInScreen
        fill-height
        :title="plannedRoute ? plannedRoute.name : 'Strecke'"
        :loading="!plannedRouteStore.loaded"
        :not-found="plannedRouteStore.loaded && !plannedRoute"
      >
        <template #not-found>
          <div class="eyebrow">Strecke nicht gefunden</div>
          <p>Diese Strecke existiert nicht (mehr). Vielleicht wurde sie gelöscht.</p>
          <Button as="router-link" to="/runs" variant="secondary" block>Zu den Strecken →</Button>
        </template>

        <template v-if="plannedRoute">
          <div class="ro-route-stats">
            <span>
              {{ (plannedRoute.distanceM / 1000).toFixed(2) }} km{{ plannedRoute.geometrySource === "straight" ? " ≈" : "" }}
            </span>
            <span>{{ plannedRoute.elevationGainM != null ? Math.round(plannedRoute.elevationGainM) + " hm" : "Höhe unbekannt" }}</span>
            <span>{{ plannedRoute.waypoints.length }} Wegpunkte</span>
          </div>

          <div class="ro-route-map">
            <RunMap :points="plannedRoute.polyline" :approximate="plannedRoute.geometrySource === 'straight'" />
          </div>

          <div v-if="showManualForm" class="manual-form panel pop-in">
            <input v-model="manualDate" type="date" aria-label="Datum des Laufs" />
            <input v-model="manualDistanceKm" type="text" inputmode="decimal" placeholder="km" aria-label="Distanz in Kilometern" />
            <input v-model="manualMinutes" type="text" inputmode="decimal" placeholder="Minuten" aria-label="Dauer in Minuten" />
            <Button :disabled="loggingManual" @click="saveManual">Speichern</Button>
            <p v-if="manualError" class="error">{{ manualError }}</p>
          </div>
        </template>

        <template #start-bar>
          <Button size="lg" block @click="showLiveRun = true">
            <template #leading><AppIcon name="play" /></template>
            Live tracken
          </Button>
          <Button variant="secondary" block @click="openManualForm">Manuell eintragen</Button>
        </template>
      </DrillInScreen>

      <LiveRunScreen
        v-if="showLiveRun"
        :route="plannedRoute"
        @finished="onLiveRunFinished"
        @close="showLiveRun = false"
      />
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* Route-specific additions — shared drill-in-screen chrome (back button, skeleton, not-found,
   header, sticky start bar) now lives in DrillInScreen.vue. */
.ro-route-stats {
  display: flex;
  gap: var(--sp3);
  font-size: 13.5px;
  color: var(--dim);
  flex: none;
}
/* Grows to fill whatever's left of the viewport (DrillInScreen's fill-height mode) instead of a
   fixed vh — was previously wrapping RouteThumbnail.vue, a component whose own hardcoded 88px
   thumbnail height silently ignored the height/interactive props this page tried to pass it,
   leaving a large blank gap above the action buttons. RunMap.vue (height:100%) is the actual
   interactive, properly-sized map component the other run/route screens already use. */
.ro-route-map {
  flex: 1;
  min-height: 220px;
  border-radius: var(--r-lg);
  overflow: hidden;
}
.manual-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp4);
  flex: none;
}
</style>
