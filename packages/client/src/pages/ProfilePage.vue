<script setup lang="ts">
// Profil & Einstellungen (mockup #p-profil). Bodyweight log lives here (not a dedicated Phase 6
// UI yet, just enough to close the rank-engine's hardcoded-75kg fallback gap). Auth token entry
// also lives here as a fallback path — the primary path is the AuthGate prompt on first 401.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref, watch } from "vue";
import BodyweightTrend from "../components/ui/BodyweightTrend.vue";
import StatTile from "../components/ui/StatTile.vue";
import { useToast } from "../composables/useToast";
import {
  importNewHealthConnectWorkouts,
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
} from "../health/healthConnect";
import { getToken, setToken } from "../lib/api";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_LABEL_DE, SUPPORT_EQUIPMENT_SLUGS } from "../lib/equipmentIcons";
import { fetchExportZip } from "../services/exportService";
import { useBodyweightStore } from "../stores/bodyweightStore";
import { useSettingsStore, type ExperienceLevel } from "../stores/settingsStore";
import { useXpStore } from "../stores/xpStore";

const bodyweight = useBodyweightStore();
const xp = useXpStore();
const { toast } = useToast();
const weightInput = ref("");
const saving = ref(false);

// Trainingsprofil (feature: onboarding's answers, editable again later — "alles lässt sich
// später im Profil ändern" from OnboardingGuide.vue's own hint text). Local drafts seeded from
// the store once it's loaded, same pattern OnboardingGuide.vue itself uses.
const settingsStore = useSettingsStore();
const sex = ref<"male" | "female" | null>(null);
const birthYearInput = ref("");
const experienceLevel = ref<ExperienceLevel | null>(null);
const workoutsPerWeek = ref(3);
const equipment = ref<Set<string>>(new Set());
const profileSaving = ref(false);
const equipmentSaving = ref(false);

watch(
  () => settingsStore.profile,
  (profile) => {
    if (!profile) return;
    sex.value = profile.sex ?? null;
    birthYearInput.value = profile.birthYear ? String(profile.birthYear) : "";
    experienceLevel.value = profile.experienceLevel ?? null;
    workoutsPerWeek.value = profile.workoutsPerWeek ?? 3;
  },
  { immediate: true },
);
watch(
  () => settingsStore.ownedEquipment,
  (owned) => {
    if (owned) equipment.value = new Set(owned);
  },
  { immediate: true },
);

function toggleEquipment(slug: string) {
  if (equipment.value.has(slug)) equipment.value.delete(slug);
  else equipment.value.add(slug);
}

// "plates" is implied by owning a barbell/ez-bar/trap-bar (requirements.ts's
// withImpliedPlates) — never a pickable chip here, same as onboarding's EquipmentStep.
const supportEquipmentSlugs = SUPPORT_EQUIPMENT_SLUGS.filter((s) => s !== "plates");

// Scheiben & Stange — feature: "specify which weight plates you have... showing the user how to
// load the barbell." Onboarding-only settings that can't be edited again would be a trap, so
// this mirrors the wizard's PlatesStep here on the settings page instead. Includes the
// adjustable-dumbbell handle weight too (unlike onboarding's 3-type step) — a rarer setup,
// better offered here where it doesn't add a 4th row to first-run onboarding.
type BarType = "barbell" | "ez-bar" | "trap-bar" | "dumbbell";
const BAR_TYPES: BarType[] = ["barbell", "ez-bar", "trap-bar", "dumbbell"];
const BAR_LABEL_DE: Record<BarType, string> = { barbell: "Langhantel", "ez-bar": "SZ-Stange", "trap-bar": "Trap-Bar", dumbbell: "Kurzhantel-Griff" };
const DEFAULT_BAR_WEIGHT_KG: Record<BarType, number> = { barbell: 20, "ez-bar": 10, "trap-bar": 25, dumbbell: 2.5 };
const ownedBarTypes = computed(() => BAR_TYPES.filter((t) => equipment.value.has(t)));

const PLATE_SIZES_KG = [25, 20, 15, 10, 5, 2.5, 1.25, 1];
const barWeightsKg = ref<Map<BarType, number>>(new Map());
const plateCounts = ref<Map<number, number>>(new Map());
const gymSaving = ref(false);

watch(
  () => settingsStore.gymSetup,
  (gym) => {
    if (!gym) return;
    barWeightsKg.value = new Map(Object.entries(gym.barWeights) as [BarType, number][]);
    plateCounts.value = new Map(gym.plates.map((p) => [p.weightKg, p.count]));
  },
  { immediate: true },
);

function plateCount(weightKg: number): number {
  return plateCounts.value.get(weightKg) ?? 0;
}
function adjustPlateCount(weightKg: number, delta: number) {
  const next = Math.max(0, plateCount(weightKg) + delta);
  if (next === 0) plateCounts.value.delete(weightKg);
  else plateCounts.value.set(weightKg, next);
}
function barWeight(type: BarType): number {
  return barWeightsKg.value.get(type) ?? DEFAULT_BAR_WEIGHT_KG[type];
}
function adjustBarWeight(type: BarType, delta: number) {
  barWeightsKg.value.set(type, Math.min(50, Math.max(1, barWeight(type) + delta)));
}
async function saveGymCard() {
  gymSaving.value = true;
  try {
    const plates = [...plateCounts.value.entries()].filter(([, count]) => count > 0).map(([weightKg, count]) => ({ weightKg, count }));
    const barWeights = Object.fromEntries([...barWeightsKg.value.entries()].filter(([type]) => ownedBarTypes.value.includes(type)));
    await settingsStore.saveGymSetup({ barWeights, plates });
    toast("Scheiben & Stange gespeichert.");
  } finally {
    gymSaving.value = false;
  }
}

const birthYear = computed(() => {
  const v = Number(birthYearInput.value);
  return Number.isInteger(v) && v >= 1900 && v <= new Date().getFullYear() ? v : undefined;
});

async function saveProfileCard() {
  profileSaving.value = true;
  try {
    await settingsStore.saveProfile({
      ...(sex.value ? { sex: sex.value } : {}),
      ...(birthYear.value ? { birthYear: birthYear.value } : {}),
      ...(experienceLevel.value ? { experienceLevel: experienceLevel.value } : {}),
      workoutsPerWeek: workoutsPerWeek.value,
    });
    toast("Trainingsprofil gespeichert.");
  } finally {
    profileSaving.value = false;
  }
}

async function saveEquipmentCard() {
  equipmentSaving.value = true;
  try {
    await settingsStore.saveEquipment([...equipment.value]);
    toast("Equipment gespeichert.");
  } finally {
    equipmentSaving.value = false;
  }
}
const tokenInput = ref(getToken());

onMounted(() => {
  void bodyweight.load();
  if (!settingsStore.profileLoaded) void settingsStore.load();
});

const canSave = computed(() => {
  const v = Number(weightInput.value.replace(",", "."));
  return !Number.isNaN(v) && v > 0 && v < 400;
});

async function saveWeight() {
  if (!canSave.value) return;
  saving.value = true;
  try {
    await bodyweight.log(Number(weightInput.value.replace(",", ".")));
    weightInput.value = "";
  } finally {
    saving.value = false;
  }
}

function saveToken() {
  setToken(tokenInput.value.trim());
}

// Health Connect import (plan Phase 5) — native-only (Android), so this whole card is hidden
// on web/iOS builds rather than shown broken. One-time permission grant here; the actual
// import check then happens automatically on every app resume (see syncStore.ts).
const healthConnectStatus = ref("");
const healthConnectBusy = ref(false);
async function connectHealthConnect() {
  healthConnectBusy.value = true;
  try {
    const granted = await requestHealthConnectPermissions();
    if (!granted) {
      healthConnectStatus.value = "Health Connect hat nicht alle Freigaben bekommen — bitte in den Health-Connect-Einstellungen nachtragen.";
      return;
    }
    const count = await importNewHealthConnectWorkouts();
    healthConnectStatus.value = count > 0 ? `${count} Lauf/Läufe importiert.` : "Verbunden — keine neuen Läufe gefunden.";
  } catch (err) {
    healthConnectStatus.value = err instanceof Error ? err.message : "Verbindung fehlgeschlagen.";
  } finally {
    healthConnectBusy.value = false;
  }
}

// CSV/ZIP backup (plan Phase 6.5) — "own your data" applied to leaving the app, not just
// keeping the server offline-safe. Raw fetch + blob, same pattern as runsStore.importGpx,
// since this needs the bearer header but isn't a JSON request/response.
const exporting = ref(false);
const exportError = ref("");
async function exportData() {
  exporting.value = true;
  exportError.value = "";
  try {
    const blob = await fetchExportZip();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `liftr-export-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Export fehlgeschlagen";
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <IonPage>
    <IonHeader>
      <IonToolbar>
        <IonTitle>Profil &amp; Einstellungen</IonTitle>
      </IonToolbar>
    </IonHeader>
    <IonContent class="ion-padding">
    <div class="profile-content">
    <p style="color: var(--dim)">Dein Server, dein Konto, deine Daten.</p>

    <section class="card">
      <h2 class="eyebrow bw-eyebrow">Körpergewicht</h2>
      <p class="hint">Dein Rang misst Gewicht immer im Verhältnis zu deinem Körpergewicht.</p>
      <div class="bw-row">
        <input
          v-model="weightInput"
          type="text"
          inputmode="decimal"
          placeholder="z.B. 72,5"
          aria-label="Körpergewicht in Kilogramm"
        />
        <span class="unit">kg</span>
        <button class="btn-primary" :disabled="!canSave || saving" @click="saveWeight">Speichern</button>
      </div>
      <p v-if="bodyweight.latest" class="current">
        Aktuell: <b class="tnum">{{ bodyweight.latest.weightKg }} kg</b> ({{ bodyweight.latest.date }})
      </p>
      <p v-else class="current" style="color: var(--faint)">
        Noch kein Eintrag — Rang-Berechnung nutzt vorläufig 75 kg.
      </p>
      <BodyweightTrend v-if="bodyweight.entries.length > 1" :entries="bodyweight.entries" />
    </section>

    <section class="card">
      <h2 class="eyebrow">Trainingsprofil</h2>
      <p class="hint">Legt fest, mit welchen Gewichten Liftr im Routinen-Assistenten startet, solange du eine Übung noch nie gemacht hast.</p>
      <div class="profile-field">
        <span class="profile-label">Geschlecht</span>
        <div class="chip-row">
          <button class="chip" :class="{ active: sex === 'male' }" @click="sex = 'male'">Männlich</button>
          <button class="chip" :class="{ active: sex === 'female' }" @click="sex = 'female'">Weiblich</button>
        </div>
      </div>
      <div class="profile-field">
        <span class="profile-label">Geburtsjahr</span>
        <input v-model="birthYearInput" class="profile-input" type="text" inputmode="numeric" placeholder="z.B. 1995" />
      </div>
      <div class="profile-field">
        <span class="profile-label">Trainingserfahrung</span>
        <div class="chip-row">
          <button class="chip" :class="{ active: experienceLevel === 'beginner' }" @click="experienceLevel = 'beginner'">Anfänger</button>
          <button class="chip" :class="{ active: experienceLevel === 'intermediate' }" @click="experienceLevel = 'intermediate'">Fortgeschritten</button>
          <button class="chip" :class="{ active: experienceLevel === 'advanced' }" @click="experienceLevel = 'advanced'">Erfahren</button>
        </div>
      </div>
      <div class="profile-field">
        <span class="profile-label">Workouts pro Woche</span>
        <div class="stepper-row">
          <button type="button" aria-label="Weniger" @click="workoutsPerWeek = Math.max(1, workoutsPerWeek - 1)">−</button>
          <span class="tnum">{{ workoutsPerWeek }}</span>
          <button type="button" aria-label="Mehr" @click="workoutsPerWeek = Math.min(14, workoutsPerWeek + 1)">+</button>
        </div>
      </div>
      <button class="btn-primary profile-save" :disabled="profileSaving" @click="saveProfileCard">
        {{ profileSaving ? "Wird gespeichert…" : "Speichern" }}
      </button>
    </section>

    <section class="card">
      <h2 class="eyebrow">Equipment</h2>
      <p class="hint">Damit dir nur Übungen vorgeschlagen werden, die du mit deinem Equipment auch machen kannst (z.B. beim Training zuhause).</p>
      <span class="profile-label">Trainingsgerät</span>
      <div class="chip-row wrap">
        <button
          v-for="slug in EQUIPMENT_SLUGS"
          :key="slug"
          class="chip"
          :class="{ active: equipment.has(slug) }"
          @click="toggleEquipment(slug)"
        >
          {{ EQUIPMENT_LABEL_DE[slug] }}
        </button>
      </div>
      <span class="profile-label support-label">Weiteres Equipment</span>
      <div class="chip-row wrap">
        <button
          v-for="slug in supportEquipmentSlugs"
          :key="slug"
          class="chip"
          :class="{ active: equipment.has(slug) }"
          @click="toggleEquipment(slug)"
        >
          {{ SUPPORT_EQUIPMENT_LABEL_DE[slug] }}
        </button>
      </div>
      <button class="btn-primary profile-save" :disabled="equipmentSaving" @click="saveEquipmentCard">
        {{ equipmentSaving ? "Wird gespeichert…" : "Speichern" }}
      </button>
    </section>

    <section v-if="ownedBarTypes.length > 0" class="card">
      <h2 class="eyebrow">Scheiben &amp; Stange</h2>
      <p class="hint">Macht die Scheiben-Anzeige beim Training exakt: nur was du wirklich hast, wird zum Beladen vorgeschlagen.</p>
      <span class="profile-label">Stangengewicht</span>
      <div class="plate-rows">
        <div v-for="type in ownedBarTypes" :key="type" class="plate-row">
          <span>{{ BAR_LABEL_DE[type] }}</span>
          <div class="stepper-row">
            <button type="button" :aria-label="`Weniger ${BAR_LABEL_DE[type]}`" @click="adjustBarWeight(type, -1)">−</button>
            <span class="tnum">{{ barWeight(type) }} kg</span>
            <button type="button" :aria-label="`Mehr ${BAR_LABEL_DE[type]}`" @click="adjustBarWeight(type, 1)">+</button>
          </div>
        </div>
      </div>
      <span class="profile-label support-label">Scheiben pro Größe</span>
      <div class="plate-rows">
        <div v-for="size in PLATE_SIZES_KG" :key="size" class="plate-row">
          <span class="tnum">{{ size }} kg</span>
          <div class="stepper-row">
            <button type="button" :aria-label="`Weniger ${size}kg`" @click="adjustPlateCount(size, -1)">−</button>
            <span class="tnum">{{ plateCount(size) }}</span>
            <button type="button" :aria-label="`Mehr ${size}kg`" @click="adjustPlateCount(size, 1)">+</button>
          </div>
        </div>
      </div>
      <button class="btn-primary profile-save" :disabled="gymSaving" @click="saveGymCard">
        {{ gymSaving ? "Wird gespeichert…" : "Speichern" }}
      </button>
    </section>

    <section class="card">
      <h2 class="eyebrow">XP &amp; Level</h2>
      <p class="hint">Zusätzlich zum Rangsystem — nichts hängt davon ab, kann jederzeit ausgeblendet werden.</p>
      <div v-if="xp.loaded" class="stat-row">
        <StatTile :value="`Lv. ${xp.level}`" label="Level" />
        <StatTile :value="xp.totalXp.toLocaleString('de-DE')" label="Gesamt-XP" />
      </div>
      <div class="bw-row">
        <span style="flex: 1">{{ xp.showXp ? "XP erscheinen im Workout und auf der Übersicht." : "XP bleiben verborgen." }}</span>
        <button class="btn-primary" @click="xp.toggleShowXp()">
          {{ xp.showXp ? "Ausblenden" : "Anzeigen" }}
        </button>
      </div>
    </section>

    <section class="card">
      <h2 class="eyebrow">API-Token</h2>
      <p class="hint">Nur nötig, wenn der Server mit LIFTR_TOKEN abgesichert ist.</p>
      <div class="bw-row">
        <input v-model="tokenInput" type="password" placeholder="Token" />
        <button class="btn-primary" @click="saveToken">Speichern</button>
      </div>
    </section>

    <section v-if="isHealthConnectAvailable()" class="card">
      <h2 class="eyebrow">Health Connect</h2>
      <p class="hint">
        Läufe, die du mit deiner Uhr aufgezeichnet hast, automatisch importieren — inklusive Route, sobald Health
        Connect sie liefert.
      </p>
      <button class="btn-primary" :disabled="healthConnectBusy" @click="connectHealthConnect">
        {{ healthConnectBusy ? "Verbinde…" : "Health Connect verbinden" }}
      </button>
      <p v-if="healthConnectStatus" class="current">{{ healthConnectStatus }}</p>
    </section>

    <section class="card">
      <h2 class="eyebrow">Daten-Export</h2>
      <p class="hint">Alle Workouts, Sätze, Läufe und Körpergewicht als CSV in einer ZIP-Datei — lesbar ohne Liftr.</p>
      <button class="btn-primary" :disabled="exporting" @click="exportData">
        {{ exporting ? "Wird erstellt…" : "Backup herunterladen" }}
      </button>
      <p v-if="exportError" class="current" style="color: var(--red)">{{ exportError }}</p>
    </section>

    <RouterLink to="/attributions" class="attributions-link">Quellen &amp; Lizenzen →</RouterLink>
    </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
.card {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r-lg);
  padding: var(--sp4);
  margin-top: var(--sp4);
  /* Entrance stagger (feedback: the rest of the app was still missing the dashboard's
     liveliness) — a single-column settings list, so a plain top-to-bottom cascade fits.
     --ease-out, not --ease-spring: the overshoot easing is reserved for earned moments
     (rank-up, PR, level-up) per motion.css's own convention (see commit 8c0f158). */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
.card:nth-of-type(1) {
  animation-delay: 0ms;
}
.card:nth-of-type(2) {
  animation-delay: 40ms;
}
.card:nth-of-type(3) {
  animation-delay: 80ms;
}
.card:nth-of-type(n + 4) {
  animation-delay: 120ms;
}
/* UI/UX rework audit §6: settings are genuinely single-column here — centering the whole
   column (not stretching any individual card) is the correct desktop fix, per the audit's
   own note on this screen. */
@media (min-width: 900px) {
  .profile-content {
    max-width: var(--content-w-narrow);
    margin: 0 auto;
  }
}
/* Design pass (audit: page read as "indistinguishable from any generic settings screen" —
   every other page uses .eyebrow, tokens.css's canonical small-caps section label, for its
   card/section headers; this page was the one holdout still using a bare <h2>). Headings stay
   semantic <h2> elements (a11y: still real headings, screen readers still get section
   structure) but are visually demoted to the app's eyebrow treatment, same as
   ErholungszoneCard/RankDistributionDonut/RunCard — the label names the section, the controls
   underneath carry the visual weight, not the heading. */
.card .eyebrow {
  display: block;
  margin-bottom: var(--sp2);
}
/* Bodyweight directly feeds the rank engine (see .hint below it) — the one accent tying this
   settings card back to the app's core mechanic, using the same blue the rank bar itself falls
   back to (tokens.css's .rankbar fallback) rather than inventing a new hue. */
.bw-eyebrow {
  --eyebrow-color: var(--blue-hi);
}
.stat-row {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp2);
  margin-bottom: var(--sp3);
}
.hint {
  font-size: 12px;
  color: var(--faint);
  margin-bottom: var(--sp3);
}
.bw-row {
  display: flex;
  gap: var(--sp2);
  align-items: center;
}
.bw-row input {
  flex: 1;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.unit {
  color: var(--faint);
  font-size: 13px;
}
.profile-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: var(--sp3);
}
.profile-label {
  font-size: 12.5px;
  color: var(--dim);
  font-weight: 700;
}
.profile-input {
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.profile-save {
  width: 100%;
  margin-top: var(--sp2);
}
.chip-row {
  display: flex;
  gap: var(--sp2);
}
.chip-row.wrap {
  flex-wrap: wrap;
}
.chip {
  padding: 8px 14px;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
}
.chip.active {
  background: var(--blue-lo);
  border-color: var(--blue);
  color: var(--on-blue-lo);
  font-weight: 800;
}
.support-label {
  display: block;
  margin-top: var(--sp3);
  margin-bottom: 6px;
}
.plate-rows {
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
  margin-bottom: var(--sp2);
}
.plate-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--sp2) var(--sp3);
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
}
.stepper-row {
  display: flex;
  align-items: center;
  gap: var(--sp3);
  background: var(--surface-3);
  border-radius: var(--r-md);
  padding: 4px;
  width: fit-content;
}
.stepper-row button {
  width: 32px;
  height: 32px;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
}
.stepper-row span {
  min-width: 24px;
  text-align: center;
  font-weight: 700;
  font-size: 14px;
}
.current {
  margin-top: var(--sp3);
  font-size: 13px;
}
.attributions-link {
  display: inline-block;
  margin-top: var(--sp5);
  color: var(--dim);
  font-size: 13px;
  text-decoration: none;
}
.attributions-link:hover {
  color: var(--text);
}
</style>
