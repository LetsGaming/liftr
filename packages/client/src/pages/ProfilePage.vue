<script setup lang="ts">
// Profil & Einstellungen. Bodyweight log lives here — enough to close the rank-engine's
// hardcoded-75kg fallback gap. Auth token entry also lives here as a fallback path — the
// primary path is the AuthGate prompt on first 401.
// Split into composables (each owns its own loading/error state) since this page used to mix
// six+ unrelated concerns directly in its script setup — see composables/use{ProfileForm,
// GymSetup,HealthConnectImport,DataExport}.ts.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, onMounted, ref } from "vue";
import AppIcon from "../components/ui/AppIcon.vue";
import BodyweightTrend from "../components/ui/BodyweightTrend.vue";
import StatTile from "../components/ui/StatTile.vue";
import { useDataExport } from "../composables/useDataExport";
import { useGymSetup, BAR_LABEL_DE, PLATE_SIZES_KG, supportEquipmentSlugs } from "../composables/useGymSetup";
import { useHealthConnectImport, isHealthConnectAvailable } from "../composables/useHealthConnectImport";
import { useProfileForm } from "../composables/useProfileForm";
import { getToken, setToken } from "../lib/api";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_LABEL_DE } from "../lib/equipmentIcons";
import { useBodyweightStore } from "../stores/bodyweightStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useThemeStore } from "../stores/themeStore";
import { useXpStore } from "../stores/xpStore";

const bodyweight = useBodyweightStore();
const theme = useThemeStore();
const xp = useXpStore();
const settingsStore = useSettingsStore();
const weightInput = ref("");
const saving = ref(false);

const { sex, birthYearInput, experienceLevel, workoutsPerWeek, profileSaving, saveProfileCard } = useProfileForm(settingsStore);
const {
  equipment,
  equipmentSaving,
  toggleEquipment,
  saveEquipmentCard,
  ownedBarTypes,
  gymSaving,
  plateCount,
  adjustPlateCount,
  barWeight,
  adjustBarWeight,
  saveGymCard,
} = useGymSetup(settingsStore);
const { healthConnectStatus, healthConnectBusy, connectHealthConnect } = useHealthConnectImport();
const { exporting, exportError, exportData } = useDataExport();

// API-Token: a locally-generated bearer token the user must verify before saving, not a login
// credential shared across services — masking it with no way to reveal would prevent confirming
// what was typed. Defaults masked. Small enough to leave on the page rather than its own composable.
const tokenInput = ref(getToken());
const tokenVisible = ref(false);
function saveToken() {
  setToken(tokenInput.value.trim());
}

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
      <p v-if="exportError" class="current" style="color: var(--danger)">{{ exportError }}</p>
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
