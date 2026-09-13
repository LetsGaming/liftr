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
import AppIcon from "../components/ui/AppIcon.vue";
import DrillInScreen from "../components/ui/DrillInScreen.vue";
import RouteThumbnail from "../components/route/RouteThumbnail.vue";
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
    <IonContent class="ion-padding">
      <DrillInScreen
        :title="plannedRoute ? plannedRoute.name : 'Strecke'"
        :loading="!plannedRouteStore.loaded"
        :not-found="plannedRouteStore.loaded && !plannedRoute"
      >
        <template #not-found>
          <div class="eyebrow">Strecke nicht gefunden</div>
          <p>Diese Strecke existiert nicht (mehr). Vielleicht wurde sie gelöscht.</p>
          <router-link to="/runs?tab=strecken" class="btn-secondary btn-block">Zu den Strecken →</router-link>
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
            <RouteThumbnail
              :points="plannedRoute.polyline"
              :approximate="plannedRoute.geometrySource === 'straight'"
              height="45vh"
              interactive
            />
          </div>
          <p class="map-credit">Karten © OpenStreetMap contributors</p>

          <div v-if="showManualForm" class="manual-form panel pop-in">
            <input v-model="manualDate" type="date" aria-label="Datum des Laufs" />
            <input v-model="manualDistanceKm" type="text" inputmode="decimal" placeholder="km" aria-label="Distanz in Kilometern" />
            <input v-model="manualMinutes" type="text" inputmode="decimal" placeholder="Minuten" aria-label="Dauer in Minuten" />
            <button class="btn-primary" :disabled="loggingManual" @click="saveManual">Speichern</button>
            <p v-if="manualError" class="error">{{ manualError }}</p>
          </div>
        </template>

        <!-- Two actions instead of one: "Live tracken" needs no confirmation step (LiveRunScreen
             has its own discard-confirm), "Manuell eintragen" toggles the inline form above
             instead of navigating away. -->
        <template #start-bar>
          <button class="btn-primary btn-lg btn-block" @click="showLiveRun = true">
            <AppIcon name="play" /> Live tracken
          </button>
          <button class="btn-secondary btn-block" @click="openManualForm">Manuell eintragen</button>
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
}
.ro-route-map {
  height: 45vh;
  min-height: 280px;
  border-radius: var(--r-lg);
  overflow: hidden;
}
.map-credit {
  color: var(--faint);
  font-size: 11px;
}
.manual-form {
  display: flex;
  flex-direction: column;
  gap: var(--sp3);
  padding: var(--sp4);
}
</style>
