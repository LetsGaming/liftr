<script setup lang="ts">
// Profil & Einstellungen. Bodyweight log lives here — enough to close the rank-engine's
// hardcoded-75kg fallback gap. Account login/logout now happens via AuthGate's setup/login/join
// forms and the member management below — no more raw token entry.
// Split into composables (each owns its own loading/error state) since this page used to mix
// six+ unrelated concerns directly in its script setup — see composables/use{ProfileForm,
// GymSetup,HealthConnectImport,DataExport}.ts.
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from "@ionic/vue";
import { computed, nextTick, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import BodyweightTrend from "../components/overview/BodyweightTrend.vue";
import CollapsibleCard from "../components/patterns/CollapsibleCard.vue";
import StatTile from "../components/patterns/StatTile.vue";
import Button from "../components/base/Button.vue";
import Chip from "../components/base/Chip.vue";
import Input from "../components/base/Input.vue";
import FormField from "../components/patterns/FormField.vue";
import ListRow from "../components/patterns/ListRow.vue";
import { useAppUpdate } from "../composables/useAppUpdate";
import { useConfirmTap } from "../composables/useConfirmTap";
import { useDataExport } from "../composables/useDataExport";
import { useGymSetup, BAR_LABEL_DE, PLATE_SIZES_KG, supportEquipmentSlugs } from "../composables/useGymSetup";
import { useHealthConnectImport } from "../composables/useHealthConnectImport";
import { useProfileForm } from "../composables/useProfileForm";
import { checkVersionMismatch, useServerConnection, useServerVersionInfo } from "../composables/useServerConnection";
import { useToast } from "../composables/useToast";
import { EQUIPMENT_LABEL_DE, EQUIPMENT_SLUGS, SUPPORT_EQUIPMENT_LABEL_DE } from "../lib/equipmentIcons";
import { ApiError } from "../lib/api";
import { isAndroid, isNative } from "../lib/platform";
import {
  changeDisplayName,
  changePassword,
  changeUsername,
  createInvite,
  deleteMyAccount,
  getMe,
  listMembers,
  listSessions,
  logout,
  removeMember,
  revokeOtherSessions,
  revokeSession,
  type Me,
  type Member,
  type Session,
} from "../services/authService";
import { useBodyweightStore } from "../stores/bodyweightStore";
import { useSettingsStore } from "../stores/settingsStore";
import { useThemeStore } from "../stores/themeStore";
import { useXpStore } from "../stores/xpStore";

const route = useRoute();
const accountAppCardOpen = ref(false);

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
  ownedBarTypes,
  gymSaving,
  plateCount,
  adjustPlateCount,
  barWeight,
  adjustBarWeight,
  saveEquipmentAndGymCard,
} = useGymSetup(settingsStore);
const {
  healthConnectStatus,
  healthConnectBusy,
  healthConnectAvailable,
  healthConnectConnected,
  connectHealthConnect,
} = useHealthConnectImport();
const { exporting, exportError, exportData } = useDataExport();

// Native-only — the web build always talks to whatever origin it's served from, no server
// concept to show/change here. See ServerGate.vue for the first-launch counterpart of this flow.
const isNativePlatform = isNative();
const { serverUrl, checking: serverChecking, error: serverError, verifyAndSave: verifyAndSaveServer } = useServerConnection();
const { serverVersion, versionMismatch } = useServerVersionInfo();
const editingServer = ref(false);
const serverInput = ref("");

function startEditingServer() {
  serverInput.value = serverUrl.value;
  editingServer.value = true;
}

async function saveServer() {
  if (await verifyAndSaveServer(serverInput.value)) {
    // Every store/composable already reads apiBase() fresh per-request, but reloading is the
    // simplest way to guarantee nothing in memory (already-fetched stores, in-flight requests)
    // is left pointing at the old server.
    window.location.reload();
  }
}

// Android-only — the update is an APK asset, meaningless on iOS/web. App.vue already runs one
// check on launch (silently); this page's own effectively re-checks on open too (shared module
// state, see useAppUpdate.ts's header comment) so the section is never stuck showing a stale
// "no update" from before a release went out mid-session.
const isAndroidPlatform = isAndroid();
const {
  currentVersion: appVersion,
  latestVersion: appLatestVersion,
  updateAvailable: appUpdateAvailable,
  checking: appUpdateChecking,
  error: appUpdateError,
  lastChecked: appUpdateLastChecked,
  check: checkForAppUpdate,
  openDownload: openAppUpdateDownload,
} = useAppUpdate();

/** The manual "Nach Updates suchen" button always needs *some* visible reaction to a tap — the
 *  automatic on-launch check (App.vue) usually already settled `updateAvailable`/`error` before
 *  the user gets here, so re-running check() alone can look like a dead button when it finds
 *  nothing new. A toast makes every tap visibly do something regardless of the outcome. */
async function checkForAppUpdateManually() {
  await checkForAppUpdate();
  if (!appUpdateAvailable.value && !appUpdateError.value) {
    useToast().toast("Du bist auf dem neuesten Stand.");
  }
}

const me = ref<Me | null>(null);
const members = ref<Member[]>([]);
const inviteCode = ref<string | null>(null);
const inviteBusy = ref(false);

async function generateInvite() {
  inviteBusy.value = true;
  try {
    const invite = await createInvite();
    inviteCode.value = invite.code;
  } finally {
    inviteBusy.value = false;
  }
}

async function removeMemberAndRefresh(id: string) {
  await removeMember(id);
  members.value = await listMembers();
}

/** Same shape as AuthGate.vue's `describeAuthError` — a 401 here means "wrong current password"
 *  rather than "not logged in" (the app-wide auth hook already let the request through), so it
 *  gets its own message per call site instead of AuthGate's generic one. */
function describeCredentialError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Zu viele Versuche. Bitte warte 15 Minuten.";
    if (err.status === 409) return "Benutzername bereits vergeben.";
    if (err.status === 400 && err.detail?.includes("too common")) {
      return "Passwort zu unsicher. Bitte wähle ein anderes Passwort.";
    }
  }
  return fallback;
}

const displayNameInput = ref("");
const displayNameSaving = ref(false);
const displayNameError = ref<string | null>(null);
const displayNameSuccess = ref(false);

async function saveDisplayName() {
  const name = displayNameInput.value.trim();
  if (!name || !me.value) return;
  displayNameSaving.value = true;
  displayNameError.value = null;
  displayNameSuccess.value = false;
  try {
    me.value = await changeDisplayName(name);
    displayNameSuccess.value = true;
  } catch (err) {
    displayNameError.value = describeCredentialError(err, "Anzeigename konnte nicht geändert werden.");
  } finally {
    displayNameSaving.value = false;
  }
}

const usernameInput = ref("");
const usernameCurrentPassword = ref("");
const usernameSaving = ref(false);
const usernameError = ref<string | null>(null);
const usernameSuccess = ref(false);

async function saveUsername() {
  const username = usernameInput.value.trim().toLowerCase();
  if (!username || !usernameCurrentPassword.value || !me.value) return;
  usernameSaving.value = true;
  usernameError.value = null;
  usernameSuccess.value = false;
  try {
    me.value = await changeUsername(usernameCurrentPassword.value, username);
    usernameCurrentPassword.value = "";
    usernameSuccess.value = true;
  } catch (err) {
    usernameError.value = describeCredentialError(err, "Aktuelles Passwort falsch.");
  } finally {
    usernameSaving.value = false;
  }
}

const currentPasswordInput = ref("");
const newPasswordInput = ref("");
const passwordSaving = ref(false);
const passwordError = ref<string | null>(null);
const passwordSuccess = ref(false);

async function savePassword() {
  if (!currentPasswordInput.value || !newPasswordInput.value) return;
  passwordSaving.value = true;
  passwordError.value = null;
  passwordSuccess.value = false;
  try {
    await changePassword(currentPasswordInput.value, newPasswordInput.value);
    currentPasswordInput.value = "";
    newPasswordInput.value = "";
    passwordSuccess.value = true;
  } catch (err) {
    passwordError.value = describeCredentialError(err, "Aktuelles Passwort falsch.");
  } finally {
    passwordSaving.value = false;
  }
}

const sessions = ref<Session[]>([]);
const sessionsLoading = ref(false);
const revokingSessionId = ref<string | null>(null);

async function loadSessions() {
  sessionsLoading.value = true;
  try {
    sessions.value = await listSessions();
  } finally {
    sessionsLoading.value = false;
  }
}

async function revokeOneSession(id: string) {
  revokingSessionId.value = id;
  try {
    await revokeSession(id);
    sessions.value = sessions.value.filter((s) => s.id !== id);
  } finally {
    revokingSessionId.value = null;
  }
}

const revokingOthers = ref(false);
const { trigger: triggerRevokeOthers, isArmed: isRevokeOthersArmed } = useConfirmTap(async () => {
  revokingOthers.value = true;
  try {
    await revokeOtherSessions();
    sessions.value = sessions.value.filter((s) => s.current);
  } finally {
    revokingOthers.value = false;
  }
});

async function handleLogout() {
  await logout();
  window.location.reload();
}

const deletingAccount = ref(false);
const { trigger: triggerDeleteAccount, isArmed: isDeleteAccountArmed } = useConfirmTap(async () => {
  deletingAccount.value = true;
  try {
    await deleteMyAccount();
    window.location.reload();
  } finally {
    deletingAccount.value = false;
  }
});

onMounted(async () => {
  void bodyweight.load();
  if (!settingsStore.profileLoaded) void settingsStore.load();
  me.value = await getMe();
  displayNameInput.value = me.value.name;
  usernameInput.value = me.value.username;
  if (me.value.role === "owner") {
    members.value = await listMembers();
  }
  void loadSessions();
  if (isAndroidPlatform) void checkForAppUpdate();
  if (isNativePlatform) void checkVersionMismatch();

  // Lets a toast/notification elsewhere ("Update verfügbar — siehe Profil") link straight to
  // the section it's talking about instead of just naming it and leaving the user to find it.
  if (route.query.focus === "account-app") {
    accountAppCardOpen.value = true;
    await nextTick();
    document.getElementById("account-app-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
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
        <Input
          v-model="weightInput"
          type="text"
          inputmode="decimal"
          placeholder="z.B. 72,5"
          aria-label="Körpergewicht in Kilogramm"
        />
        <span class="unit">kg</span>
        <Button :disabled="!canSave || saving" @click="saveWeight">Speichern</Button>
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
      <CollapsibleCard title="Trainingsprofil">
        <p class="hint">Legt fest, mit welchen Gewichten Liftr im Routinen-Assistenten startet, solange du eine Übung noch nie gemacht hast.</p>
        <FormField label="Geschlecht" class="profile-field">
          <div class="chip-row">
            <button class="chip" :class="{ active: sex === 'male' }" @click="sex = 'male'">Männlich</button>
            <button class="chip" :class="{ active: sex === 'female' }" @click="sex = 'female'">Weiblich</button>
          </div>
        </FormField>
        <FormField label="Geburtsjahr" class="profile-field">
          <Input v-model="birthYearInput" class="profile-input" type="text" inputmode="numeric" placeholder="z.B. 1995" />
        </FormField>
        <FormField label="Trainingserfahrung" class="profile-field">
          <div class="chip-row">
            <button class="chip" :class="{ active: experienceLevel === 'beginner' }" @click="experienceLevel = 'beginner'">Anfänger</button>
            <button class="chip" :class="{ active: experienceLevel === 'intermediate' }" @click="experienceLevel = 'intermediate'">Fortgeschritten</button>
            <button class="chip" :class="{ active: experienceLevel === 'advanced' }" @click="experienceLevel = 'advanced'">Erfahren</button>
          </div>
        </FormField>
        <FormField label="Workouts pro Woche" class="profile-field">
          <div class="stepper-row">
            <button type="button" aria-label="Weniger" @click="workoutsPerWeek = Math.max(1, workoutsPerWeek - 1)">−</button>
            <span class="tnum">{{ workoutsPerWeek }}</span>
            <button type="button" aria-label="Mehr" @click="workoutsPerWeek = Math.min(14, workoutsPerWeek + 1)">+</button>
          </div>
        </FormField>
        <Button class="profile-save" :disabled="profileSaving" @click="saveProfileCard">
          {{ profileSaving ? "Wird gespeichert…" : "Speichern" }}
        </Button>
      </CollapsibleCard>
    </section>

    <section class="card surface-hybrid">
      <CollapsibleCard title="Equipment">
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

        <template v-if="ownedBarTypes.length > 0">
          <span class="profile-label support-label">Stangengewicht</span>
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
        </template>

        <Button class="profile-save" :disabled="equipmentSaving || gymSaving" @click="saveEquipmentAndGymCard">
          {{ equipmentSaving || gymSaving ? "Wird gespeichert…" : "Speichern" }}
        </Button>
      </CollapsibleCard>
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
        <Button @click="xp.toggleShowXp()">
          {{ xp.showXp ? "Ausblenden" : "Anzeigen" }}
        </Button>
      </div>
    </section>

    <h2 class="group-header">Darstellung</h2>

    <section class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Darstellung</h2>
      <div class="chip-row">
        <button class="chip" :class="{ active: theme.theme === 'dark' }" @click="theme.theme === 'light' && theme.toggle()">Dunkel</button>
        <button class="chip" :class="{ active: theme.theme === 'light' }" @click="theme.theme === 'dark' && theme.toggle()">Hell</button>
      </div>
    </section>

    <h2 class="group-header">Konto</h2>

    <section v-if="me?.role === 'owner'" class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Mitglieder</h2>
      <ul v-if="members.length" class="member-list">
        <ListRow v-for="member in members" :key="member.id" as="li" class="member-row">
          <span>{{ member.name }} ({{ member.username }})</span>
          <template v-if="member.role !== 'owner'" #trailing>
            <Button variant="secondary" @click="removeMemberAndRefresh(member.id)">
              Entfernen
            </Button>
          </template>
        </ListRow>
      </ul>
      <Button :disabled="inviteBusy" @click="generateInvite">
        {{ inviteBusy ? "…" : "Einladungscode erstellen" }}
      </Button>
      <p v-if="inviteCode" class="invite-code">Code: <strong>{{ inviteCode }}</strong> (24h gültig)</p>
    </section>

    <section class="card card--quiet surface-hybrid">
      <CollapsibleCard title="Anmeldedaten">
        <div class="profile-field">
          <span class="profile-label">Anzeigename</span>
          <Input v-model="displayNameInput" class="profile-input" type="text" autocomplete="name" />
          <p v-if="displayNameError" class="error">{{ displayNameError }}</p>
          <p v-else-if="displayNameSuccess" class="hint success">Gespeichert.</p>
        </div>
        <Button
          class="profile-save"
          :disabled="displayNameSaving || !displayNameInput.trim()"
          @click="saveDisplayName"
        >
          {{ displayNameSaving ? "Wird gespeichert…" : "Anzeigename speichern" }}
        </Button>

        <h3 class="eyebrow sub-eyebrow">Benutzername</h3>
        <FormField label="Neuer Benutzername" class="profile-field">
          <Input v-model="usernameInput" class="profile-input" type="text" autocomplete="username" autocapitalize="off" />
        </FormField>
        <FormField label="Aktuelles Passwort" class="profile-field">
          <Input v-model="usernameCurrentPassword" class="profile-input" type="password" autocomplete="current-password" />
        </FormField>
        <p v-if="usernameError" class="error">{{ usernameError }}</p>
        <p v-else-if="usernameSuccess" class="hint success">Benutzername geändert. Andere Geräte wurden abgemeldet.</p>
        <Button
          class="profile-save"
          :disabled="usernameSaving || !usernameInput.trim() || !usernameCurrentPassword"
          @click="saveUsername"
        >
          {{ usernameSaving ? "Wird geändert…" : "Benutzername ändern" }}
        </Button>

        <h3 class="eyebrow sub-eyebrow">Passwort</h3>
        <FormField label="Aktuelles Passwort" class="profile-field">
          <Input v-model="currentPasswordInput" class="profile-input" type="password" autocomplete="current-password" />
        </FormField>
        <FormField label="Neues Passwort" class="profile-field">
          <Input v-model="newPasswordInput" class="profile-input" type="password" autocomplete="new-password" />
        </FormField>
        <p v-if="passwordError" class="error">{{ passwordError }}</p>
        <p v-else-if="passwordSuccess" class="hint success">Passwort geändert. Andere Geräte wurden abgemeldet.</p>
        <Button
          class="profile-save"
          :disabled="passwordSaving || !currentPasswordInput || !newPasswordInput"
          @click="savePassword"
        >
          {{ passwordSaving ? "Wird geändert…" : "Passwort ändern" }}
        </Button>
      </CollapsibleCard>
    </section>

    <section class="card card--quiet surface-hybrid">
      <CollapsibleCard title="Aktive Sitzungen">
        <p v-if="sessionsLoading" class="hint">Wird geladen…</p>
        <ul v-else class="member-list">
          <ListRow v-for="session in sessions" :key="session.id" as="li" class="member-row">
            <span>
              {{ session.device }}
              <Chip v-if="session.current" size="sm" class="session-badge">Dieses Gerät</Chip>
            </span>
            <template v-if="!session.current" #trailing>
              <Button
                variant="secondary"
                :disabled="revokingSessionId === session.id"
                @click="revokeOneSession(session.id)"
              >
                Abmelden
              </Button>
            </template>
          </ListRow>
        </ul>
        <Button
          v-if="sessions.length > 1"
          variant="secondary"
          block
          class="danger"
          :class="{ confirming: isRevokeOthersArmed() }"
          :disabled="revokingOthers"
          @click="triggerRevokeOthers()"
        >
          {{ revokingOthers ? "Wird abgemeldet…" : isRevokeOthersArmed() ? "Wirklich alle abmelden?" : "Alle anderen Geräte abmelden" }}
        </Button>
      </CollapsibleCard>
    </section>

    <section id="account-app-card" class="card card--quiet surface-hybrid">
      <CollapsibleCard v-model:open="accountAppCardOpen" title="Konto &amp; App">
        <template v-if="isNativePlatform">
          <h3 class="eyebrow sub-eyebrow">Server</h3>
          <template v-if="!editingServer">
            <p class="hint">{{ serverUrl }}</p>
            <Button variant="secondary" @click="startEditingServer">Ändern</Button>
          </template>
          <template v-else>
            <Input
              v-model="serverInput"
              type="text"
              placeholder="liftr.example.com"
              aria-label="Server-Adresse"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
            />
            <p v-if="serverError" class="error">{{ serverError }}</p>
            <div class="server-actions">
              <Button variant="secondary" @click="editingServer = false">Abbrechen</Button>
              <Button :disabled="serverChecking || !serverInput.trim()" @click="saveServer">
                {{ serverChecking ? "Prüfe…" : "Speichern" }}
              </Button>
            </div>
          </template>
          <p v-if="serverVersion" class="hint" :class="{ error: versionMismatch }">
            Server-Version: v{{ serverVersion }}{{ appVersion ? ` · App-Version: v${appVersion}` : "" }}
          </p>
          <p v-if="versionMismatch" class="error">
            Server- und App-Version stimmen nicht überein — das kann zu Fehlern führen.
          </p>
        </template>

        <h3 class="eyebrow sub-eyebrow">Version</h3>
        <p class="hint">{{ appVersion ? `v${appVersion}` : "…" }}</p>
        <template v-if="isAndroidPlatform">
          <p v-if="appUpdateAvailable" class="update-line">Update verfügbar: v{{ appLatestVersion }}</p>
          <p v-else-if="appUpdateError" class="error">{{ appUpdateError }}</p>
          <p v-else-if="appUpdateLastChecked" class="hint">Du bist auf dem neuesten Stand.</p>
          <div class="server-actions">
            <Button variant="secondary" :disabled="appUpdateChecking" @click="checkForAppUpdateManually">
              {{ appUpdateChecking ? "Prüfe…" : "Nach Updates suchen" }}
            </Button>
            <Button v-if="appUpdateAvailable" @click="openAppUpdateDownload">Herunterladen</Button>
          </div>
        </template>

        <h3 class="eyebrow sub-eyebrow">Diagnose</h3>
        <p class="hint">
          Sync-Protokoll{{ me?.role === "owner" ? " und Serverfehler" : "" }} — hilfreich, falls mal etwas nicht
          funktioniert. Normalerweise brauchst du das nicht.
        </p>
        <Button as="router-link" to="/diagnostics" variant="secondary" block>Protokoll öffnen</Button>

        <Button variant="secondary" block class="logout-btn" @click="handleLogout">Abmelden</Button>
      </CollapsibleCard>
    </section>

    <section v-if="me && me.role !== 'owner'" class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Konto löschen</h2>
      <p class="hint">
        Löscht dein Konto und alle deine Daten (Workouts, Läufe, Routinen) unwiderruflich. Zweimal
        tippen zum Bestätigen.
      </p>
      <Button
        variant="secondary"
        block
        class="danger"
        :class="{ confirming: isDeleteAccountArmed() }"
        :disabled="deletingAccount"
        @click="triggerDeleteAccount()"
      >
        {{ deletingAccount ? "Wird gelöscht…" : isDeleteAccountArmed() ? "Wirklich löschen?" : "Konto löschen" }}
      </Button>
    </section>

    <h2 class="group-header">Daten</h2>

    <section v-if="healthConnectAvailable" class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Health Connect</h2>
      <p class="hint">
        Läufe, die du mit deiner Uhr aufgezeichnet hast, importieren — inklusive Route, sobald Health Connect sie
        liefert. Einmal verbinden, danach synchronisiert Liftr neue Läufe automatisch bei jedem App-Start; der Button
        stößt eine Synchronisierung jederzeit sofort an.
      </p>
      <Button :disabled="healthConnectBusy" @click="connectHealthConnect">
        {{ healthConnectBusy ? "Synchronisiere…" : healthConnectConnected ? "Jetzt synchronisieren" : "Health Connect verbinden" }}
      </Button>
      <p v-if="healthConnectStatus" class="current">{{ healthConnectStatus }}</p>
    </section>

    <section class="card card--quiet surface-hybrid">
      <h2 class="eyebrow">Daten-Export</h2>
      <p class="hint">Alle Workouts, Sätze, Läufe und Körpergewicht als CSV in einer ZIP-Datei — lesbar ohne Liftr.</p>
      <Button :disabled="exporting" @click="exportData">
        {{ exporting ? "Wird erstellt…" : "Backup herunterladen" }}
      </Button>
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
  margin-top: 0;
}
/* Sub-section labels inside the merged "Konto & App" card (Server/Version/Diagnose used to each
   be their own card with their own .eyebrow h2; now one card, so each block needs its own small
   heading without re-adding a whole new card). */
.sub-eyebrow {
  margin-top: var(--sp4);
}
.sub-eyebrow:first-child {
  margin-top: 0;
}
.logout-btn {
  margin-top: var(--sp4);
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
input[aria-label="Server-Adresse"] {
  margin-bottom: var(--sp2);
}
.server-actions {
  display: flex;
  gap: var(--sp2);
}
.server-actions .btn-primary {
  flex: 1;
}
.error {
  color: var(--danger);
  font-size: 12px;
  margin-bottom: var(--sp2);
}
.update-line {
  color: var(--blue-hi);
  font-weight: 700;
  font-size: 13px;
  margin-bottom: var(--sp2);
}
.bw-row {
  display: flex;
  gap: var(--sp2);
  align-items: center;
}
.bw-row :deep(.input-wrap) {
  flex: 1;
  min-width: 0;
}
.member-list {
  list-style: none;
  padding: 0;
  margin: 0 0 var(--sp3);
  display: flex;
  flex-direction: column;
  gap: var(--sp2);
}
.member-row {
  gap: var(--sp2);
  font-size: 14px;
}
.invite-code {
  margin-top: var(--sp3);
  font-size: 13px;
  color: var(--dim);
}
.hint.success {
  color: var(--blue-hi);
}
.session-badge {
  margin-left: var(--sp2);
  padding: 2px 8px;
  background: var(--surface-3);
  border: none;
  color: var(--faint);
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
/* Same armed-confirm-tap treatment as list-card.css's `.card-menu button.danger` — reused here
   since this is the only full-width (not menu-row) destructive button in the app so far. */
.btn-secondary.danger {
  color: var(--danger);
}
.btn-secondary.danger.confirming {
  background: var(--danger-lo);
  color: var(--text);
  font-weight: 700;
}
</style>
