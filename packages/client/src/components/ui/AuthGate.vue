<script setup lang="ts">
/**
 * Auth entry screen. Blocks the app behind one of three states depending on server/URL state:
 * setup (fresh install, no owner password yet), join (URL carries `?invite=CODE`), or login
 * (default). All three exchange credentials for a bearer token via `setToken`, then re-check.
 */
import { onMounted, ref } from "vue";
import { ApiError, api, setToken } from "../../lib/api";
import AppIcon from "./AppIcon.vue";

type Status = "checking" | "ok" | "setup" | "join" | "login" | "offline";

const emit = defineEmits<{ authenticated: [] }>();

const status = ref<Status>("checking");
const username = ref("");
const password = ref("");
const inviteCode = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);
const passwordVisible = ref(false);

function getInviteCodeFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("invite");
}

/**
 * The three submit handlers below all showed one fixed message per form regardless of the actual
 * server response, which became actively misleading once this branch added two new rejection
 * paths: a 429 from `authRateLimit` (routes/auth.ts) reads as a wrong password/code with no way to
 * learn "wait and retry", and a 400 from the common-password refine (passwordSchema in
 * routes/auth.ts, backed by lib/commonPasswords.ts) reads as a generic setup/invite failure with
 * no way to learn the password itself was rejected.
 *
 * The common-password case is only distinguishable by string-matching the Zod refine's message
 * text inside `detail` (fastify-type-provider-zod's validator surfaces the refine's `.message`
 * verbatim in the FST_ERR_VALIDATION error) — there is no dedicated error code for it. Every other
 * 400 (bad invite code, taken username, plain validation failures) falls through to `fallback`.
 */
function describeAuthError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return "Zu viele Versuche. Bitte warte 15 Minuten.";
    if (err.status === 400 && err.detail?.includes("too common")) {
      return "Passwort zu unsicher. Bitte wähle ein anderes Passwort.";
    }
  }
  return fallback;
}

async function check() {
  status.value = "checking";
  try {
    const { needsSetup } = await api.get<{ needsSetup: boolean }>("/api/auth/status");
    if (needsSetup) {
      status.value = "setup";
      return;
    }
    await api.get("/api/health");
    status.value = "ok";
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      inviteCode.value = getInviteCodeFromUrl() ?? "";
      status.value = inviteCode.value ? "join" : "login";
    } else {
      // Offline on first load with no cached auth state — let the app through; the PWA shell +
      // cached catalog still work, and API calls retry once online.
      status.value = "offline";
    }
  }
}

onMounted(check);

async function submitSetup() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/setup", { password: password.value });
    setToken(token);
    status.value = "ok";
    emit("authenticated");
  } catch (err) {
    error.value = describeAuthError(err, "Einrichtung fehlgeschlagen.");
  } finally {
    submitting.value = false;
  }
}

async function submitLogin() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/login", {
      username: username.value.trim().toLowerCase(),
      password: password.value,
    });
    setToken(token);
    status.value = "ok";
    emit("authenticated");
  } catch (err) {
    error.value = describeAuthError(err, "Benutzername oder Passwort falsch.");
  } finally {
    submitting.value = false;
  }
}

async function submitJoin() {
  submitting.value = true;
  error.value = null;
  try {
    const { token } = await api.post<{ token: string }>("/api/auth/register", {
      code: inviteCode.value.trim().toUpperCase(),
      username: username.value.trim().toLowerCase(),
      password: password.value,
    });
    setToken(token);
    status.value = "ok";
    emit("authenticated");
  } catch (err) {
    error.value = describeAuthError(err, "Einladungscode ungültig oder Benutzername bereits vergeben.");
  } finally {
    submitting.value = false;
  }
}

function submit() {
  if (status.value === "setup") return submitSetup();
  if (status.value === "join") return submitJoin();
  return submitLogin();
}
</script>

<template>
  <div v-if="status === 'setup' || status === 'login' || status === 'join'" class="gate">
    <div class="card surface-hybrid">
      <h1>Liftr</h1>
      <p v-if="status === 'setup'">Richte dein Besitzer-Konto ein.</p>
      <p v-else-if="status === 'join'">Tritt mit deinem Einladungscode bei.</p>
      <p v-else>Melde dich an.</p>

      <input v-if="status === 'join'" v-model="inviteCode" type="text" placeholder="Einladungscode" aria-label="Einladungscode" />
      <input v-if="status !== 'setup'" v-model="username" type="text" placeholder="Benutzername" aria-label="Benutzername" autocomplete="username" />
      <div class="password-row">
        <input
          v-model="password"
          :type="passwordVisible ? 'text' : 'password'"
          placeholder="Passwort"
          aria-label="Passwort"
          autocomplete="current-password"
          @keyup.enter="submit"
        />
        <button
          type="button"
          class="btn-secondary"
          :aria-label="passwordVisible ? 'Passwort verbergen' : 'Passwort anzeigen'"
          @click="passwordVisible = !passwordVisible"
        >
          <AppIcon :name="passwordVisible ? 'eye-off' : 'eye'" />
        </button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <button
        class="btn-primary btn-lg btn-block"
        :disabled="submitting || !password.trim() || (status !== 'setup' && !username.trim()) || (status === 'join' && !inviteCode.trim())"
        @click="submit"
      >
        {{ submitting ? "…" : status === "setup" ? "Einrichten" : status === "join" ? "Beitreten" : "Anmelden" }}
      </button>
      <p v-if="status === 'login'" class="hint">
        Passwort vergessen? Der Server-Betreiber kann es zurücksetzen.
      </p>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
/* No background here: an opaque fill would sit in front of tokens.css's body::before cosmic
   sweep, which paints behind body's children and gets hidden by any opaque child on top of it —
   this is the first screen a locked-down server shows, so it needs to let the sweep show through
   like every other screen. */
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
/* .surface-hybrid (tokens.css) instead of a flat --surface-2 fill + --line border, so this card
   reads as a translucent object floating over the sweep instead of an opaque box painted over it. */
.card {
  border-radius: var(--r-xl);
  padding: var(--sp8);
  width: min(320px, 100% - 2 * var(--sp4));
  text-align: center;
}
.card h1 {
  font-size: 22px;
  margin-bottom: var(--sp2);
}
.card p {
  color: var(--dim);
  font-size: 13px;
  margin-bottom: var(--sp4);
}
.card input[type="text"] {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  margin-bottom: var(--sp2);
}
.password-row {
  display: flex;
  gap: var(--sp2);
  margin-bottom: var(--sp3);
}
.password-row input {
  flex: 1;
  min-width: 0;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
}
.error {
  color: var(--danger);
}
.hint {
  margin: var(--sp3) 0 0;
  color: var(--faint);
  font-size: 12px;
}
</style>
