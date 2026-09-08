<script setup lang="ts">
// Profil & Einstellungen. Bodyweight log lives here — enough to close the rank-engine's
// hardcoded-75kg fallback gap. Auth token entry also lives here as a fallback path — the
// primary path is the AuthGate prompt on first 401.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref, watch } from "vue";
import AppIcon from "../components/ui/AppIcon.vue";
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
import { useThemeStore } from "../stores/themeStore";
import { useXpStore } from "../stores/xpStore";

const bodyweight = useBodyweightStore();
const theme = useThemeStore();
const xp = useXpStore();
const { toast } = useToast();
const weightInput = ref("");
const saving = ref(false);

// Trainingsprofil — onboarding's answers, editable again later ("alles lässt sich später im
// Profil ändern", per OnboardingGuide.vue's own hint text). Local drafts seeded from the store
// once it's loaded, same pattern OnboardingGuide.vue itself uses.
const settingsStore = useSettingsStore();
const sex = ref<"male" | "female" | null>(null);
const birthYearInput = ref("");
const experienceLevel = ref<ExperienceLevel | null>(null);
const workoutsPerWeek = ref(3);
// Defaults to bodyweight-owned even before the store loads (same default as onboarding's
// OnboardingDraft.ts) — a profile with no saved equipment yet (server returns null, e.g. a
// brand-new account) must never render as "nothing owned, not even your own body".
const equipment = ref<Set<string>>(new Set(["bodyweight"]));
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
    // Bodyweight is always available (everyone has a body) — force it into the set
    // regardless of what the server has on record, same guarantee as onboarding's
    // OnboardingDraft.ts default (`new Set(["bodyweight"])`), so a stored profile that
    // predates this fix (or one saved without it, see the toggle guard below) still shows
    // it as owned instead of silently reverting to "not selected".
    if (owned) equipment.value = new Set([...owned, "bodyweight"]);
  },
  { immediate: true },
);

// Bodyweight can never be deselected — every user has a body, so unchecking it would just
// break exercise suggestions for no real-world reason (same fix as onboarding's equipment
// step is meant to have). Guard here rather than disabling the chip outright so it still
// reads as "on" rather than as a dead control.
function toggleEquipment(slug: string) {
  if (slug === "bodyweight") return;
  if (equipment.value.has(slug)) equipment.value.delete(slug);
  else equipment.value.add(slug);
}

// "plates" is implied by owning a barbell/ez-bar/trap-bar (requirements.ts's
// withImpliedPlates) — never a pickable chip here, same as onboarding's EquipmentStep.
const supportEquipmentSlugs = SUPPORT_EQUIPMENT_SLUGS.filter((s) => s !== "plates");

// Scheiben & Stange — lets the user specify which weight plates they have, so the app can show
// how to load the barbell. Onboarding-only settings that can't be edited again would be a trap,
// so this mirrors the wizard's PlatesStep here on the settings page instead. Includes the
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
/** This is a locally-generated bearer token the user must verify before saving, not a login
 *  credential shared across services — masking it with no way to reveal would prevent confirming
 *  what was typed. Defaults masked. */
const tokenVisible = ref(false);

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

// Health Connect import is native-only (Android), so this whole card is hidden on web/iOS
// builds rather than shown broken. One-time permission grant here; the actual import check
// then happens automatically on every app resume (see syncStore.ts).
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

// CSV/ZIP backup — lets the user take their data with them, not just keep it offline-safe on
// the server. Raw fetch + blob, same pattern as runsStore.importGpx, since this needs the
// bearer header but isn't a JSON request/response.
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

    <h2 class="group-header">Trainingsprofil</h2>

    <section class="card surface-hybrid">
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
        Aktuell: <b class="tnum">{{ Math.round(bodyweight.latest.weightKg * 100) / 100 }} kg</b> ({{ bodyweight.latest.date }})
      </p>
      <p v-else class="current" style="color: var(--faint)">
        Trag dein Gewicht oben ein — bis dahin nutzt die Rang-Berechnung vorläufig 75 kg.
      </p>
      <BodyweightTrend v-if="bodyweight.entries.length > 1" :entries="bodyweight.entries" />
    </section>

    <section class="card surface-hybrid">
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

    <section class="card surface-hybrid">
      <h2 class="eyebrow">Equipment</h2>
      <p class="hint">Damit dir nur Übungen vorgeschlagen werden, die du mit deinem Equipment auch machen kannst (z.B. beim Training zuhause).</p>
      <span class="profile-label">Trainingsgerät</span>
      <div class="chip-row wrap">
        <button
          v-for="slug in EQUIPMENT_SLUGS"
          :key="slug"
          class="chip"
          :class="{ active: equipment.has(slug), locked: slug === 'bodyweight' }"
          :aria-disabled="slug === 'bodyweight' ? 'true' : undefined"
          :title="slug === 'bodyweight' ? 'Körpergewicht ist immer aktiv' : undefined"
          @click="toggleEquipment(slug)"
        >
          {{ EQUIPMENT_LABEL_DE[slug] }}<span v-if="slug === 'bodyweight'" class="lock-mark" aria-hidden="true"> 🔒</span>
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

    <section v-if="ownedBarTypes.length > 0" class="card surface-hybrid">
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

    <h2 class="group-header">Fortschritt</h2>

    <section class="card surface-hybrid">
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

    <h2 class="group-header">Daten &amp; Server</h2>

    <section class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Darstellung</h2>
      <div class="chip-row">
        <button class="chip" :class="{ active: theme.theme === 'dark' }" @click="theme.theme === 'light' && theme.toggle()">Dunkel</button>
        <button class="chip" :class="{ active: theme.theme === 'light' }" @click="theme.theme === 'dark' && theme.toggle()">Hell</button>
      </div>
    </section>

    <section class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">API-Token</h2>
      <p class="hint">
        Nur nötig, wenn der Server mit LIFTR_TOKEN abgesichert ist — derselbe Wert, nach dem beim
        Start auch der Entsperren-Bildschirm fragt, falls der Server einen Token verlangt.
      </p>
      <!-- .bw-row's 2-item layout (input + one button) doesn't fit 3 items (input + reveal
           toggle + save) at narrow widths — wrap lets the buttons flow to their own line
           instead of overflowing the card; the bodyweight row above (still 2 items) is
           unaffected. -->
      <div class="bw-row token-row">
        <input
          v-model="tokenInput"
          :type="tokenVisible ? 'text' : 'password'"
          placeholder="Token"
          aria-label="API-Token"
        />
        <button
          type="button"
          class="btn-secondary"
          :aria-label="tokenVisible ? 'Token verbergen' : 'Token anzeigen'"
          @click="tokenVisible = !tokenVisible"
        >
          <AppIcon :name="tokenVisible ? 'eye-off' : 'eye'" />
        </button>
        <button class="btn-primary" @click="saveToken">Speichern</button>
      </div>
    </section>

    <section v-if="isHealthConnectAvailable()" class="card card--quiet surface-hybrid">
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

    <section class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Daten-Export</h2>
      <p class="hint">Alle Workouts, Sätze, Läufe und Körpergewicht als CSV in einer ZIP-Datei — lesbar ohne Liftr.</p>
      <button class="btn-primary" :disabled="exporting" @click="exportData">
        {{ exporting ? "Wird erstellt…" : "Backup herunterladen" }}
      </button>
      <p v-if="exportError" class="current" style="color: var(--red)">{{ exportError }}</p>
    </section>

    <h2 class="group-header">Über</h2>

    <RouterLink to="/attributions" class="attributions-link">Quellen &amp; Lizenzen →</RouterLink>
    </div>
    </IonContent>
  </IonPage>
</template>

<style scoped>
/* .surface-hybrid (applied in the template alongside .card, tokens.css) gives every settings
   section a translucent panel look over the cosmic sweep instead of an opaque box. border-radius
   stays local since .surface-hybrid doesn't set one — it's layered over whatever shape the host
   already uses. */
.card {
  position: relative;
  border-radius: var(--r-lg);
  padding: var(--sp4);
  margin-top: var(--sp4);
  /* Entrance stagger — a single-column settings list, so a plain top-to-bottom cascade fits.
     --ease-out, not --ease-spring: the overshoot easing is reserved for earned moments
     (rank-up, PR, level-up) per motion.css's own convention. */
  animation: pop-in var(--dur-base) var(--ease-out) both;
}
/* The 1px gradient hairline ring (tokens.css's .panel::after technique, reproduced here —
   see that comment for the mask-composite mechanics). Replaces the old flat `border: 1px
   solid var(--line)` on .card itself. */
.card::after {
  content: "";
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: var(--surface-hybrid-edge-grad);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
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
/* Settings are genuinely single-column here — centering the whole column (not stretching any
   individual card) is the correct desktop fix. */
@media (min-width: 900px) {
  .profile-content {
    max-width: var(--content-w-narrow);
    margin: 0 auto;
  }
}
/* Every other page uses .eyebrow, tokens.css's canonical small-caps section label, for its
   card/section headers. Headings stay semantic <h2> elements (a11y: still real headings, screen
   readers still get section structure) but are visually demoted to the app's eyebrow treatment,
   same as ErholungszoneCard/RankDistributionDonut/RunCard — the label names the section, the
   controls underneath carry the visual weight, not the heading. */
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
  min-width: 0;
  padding: 10px 12px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  color: var(--text);
  font-size: 14px;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
/* Nebula-tinted focus state (see .profile-input's identical rule below for the shared
   rationale) — was relying only on the global :focus-visible outline, which reads as a
   generic browser affordance rather than part of this app's own accent system. */
.bw-row input:focus-visible {
  border-color: var(--nebula-m);
  box-shadow: 0 0 0 3px var(--nebula-glow);
}
/* Token row has 3 items (input + reveal toggle + save) instead of the base 2 — wraps to a
   second line on narrow viewports instead of overflowing the card. */
.token-row {
  flex-wrap: wrap;
}
.token-row input {
  flex-basis: 100%;
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
  border: 1px solid var(--line-2);
  color: var(--text);
  font-size: 14px;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
}
/* Same nebula-tinted focus ring as every other text input on this page — the app's accent
   gradient, not the browser default, is what should announce "you're editing this field". */
.profile-input:focus-visible {
  border-color: var(--nebula-m);
  box-shadow: 0 0 0 3px var(--nebula-glow);
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
  border: 1px solid var(--line-2);
  color: var(--dim);
  font-size: 13px;
  font-weight: 600;
  min-height: var(--touch-target-min);
  transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out),
    border-color var(--dur-fast) var(--ease-out);
}
.chip:active:not(.locked) {
  transform: scale(0.96);
}
/* Selected state now takes the app's actual accent — the CTA/reward gradient (.btn-primary,
   .chip's onboarding sibling could use this too) — instead of a flat --blue-lo fill, so a
   selected chip visually agrees with every other "this is the active/primary thing" surface
   in the app rather than inventing its own one-off blue. */
.chip.active {
  background: var(--nebula-grad);
  border-color: transparent;
  color: var(--nebula-ink-on-fill);
  font-weight: 800;
  box-shadow: 0 4px 14px -6px var(--nebula-glow);
}
/* Bodyweight equipment chip — always owned, never deselectable (fix: it could previously be
   toggled off, silently breaking exercise suggestions for a piece of "equipment" everyone
   always has). Kept visually active but with a locked affordance instead of just disabling
   the button outright, so it still reads as "on" rather than as dead UI. */
.chip.locked {
  cursor: default;
}
.lock-mark {
  font-size: 11px;
  opacity: 0.85;
}
@media (hover: hover) {
  .chip:not(.active):not(.locked):hover {
    background: var(--surface-2);
    border-color: var(--nebula-m);
  }
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
  border: 1px solid var(--line-2);
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
  border: 1px solid var(--line-2);
  color: var(--text);
  font-size: 17px;
  font-weight: 700;
  transition: transform var(--dur-fast) var(--ease-out), border-color var(--dur-fast) var(--ease-out);
}
.stepper-row button:active {
  transform: scale(0.9);
  border-color: var(--nebula-m);
}
@media (hover: hover) {
  .stepper-row button:hover {
    border-color: var(--nebula-m);
  }
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
.group-header {
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--faint);
  margin: var(--sp6) 0 0;
}
.group-header:first-of-type {
  margin-top: var(--sp2);
}
/* Shares the same .surface-hybrid fill as .card; reduced opacity alone recedes this section
   relative to the profile/equipment cards above. */
.card--quiet {
  opacity: 0.92;
}
</style>
