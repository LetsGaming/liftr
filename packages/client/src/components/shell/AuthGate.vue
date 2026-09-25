<script setup lang="ts">
/**
 * Auth entry screen. Blocks the app behind one of three states depending on server/URL state:
 * setup (fresh install, no owner password yet), join (URL carries `?invite=CODE`), or login
 * (default). All three exchange credentials for a bearer token via `setToken`, then re-check.
 */
import { onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
import { ApiError, api, setToken } from "../../lib/api";
import AppIcon from "../base/AppIcon.vue";
import Button from "../base/Button.vue";

type Status = "checking" | "ok" | "setup" | "join" | "login" | "offline";

const emit = defineEmits<{ authenticated: [] }>();
const { t } = useI18n();

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
 * learn "wait and retry", and a `password_too_common` from the common-password refine
 * (passwordSchema in routes/auth.ts, backed by lib/commonPasswords.ts — recognized and given its
 * own error code by app.ts's error handler) reads as a generic setup/invite failure with no way
 * to learn the password itself was rejected. Every other 400 (bad invite code, taken username,
 * plain validation failures) falls through to `fallback`.
 */
function describeAuthError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.status === 429) return t("profile.errors.tooManyAttempts");
    if (err.status === 400 && err.code === "password_too_common") {
      return t("profile.errors.passwordTooWeak");
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
    // /api/health is intentionally public (see app.ts) and would succeed with no token — check an
    // authenticated route instead, so an owner already existing on the server doesn't skip login.
    await api.get("/api/auth/me");
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
    error.value = describeAuthError(err, t("shell.authGate.setupFailed"));
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
    error.value = describeAuthError(err, t("shell.authGate.loginFailed"));
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
    error.value = describeAuthError(err, t("shell.authGate.joinFailed"));
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
      <p v-if="status === 'setup'">{{ t("shell.authGate.setupIntro") }}</p>
      <p v-else-if="status === 'join'">{{ t("shell.authGate.joinIntro") }}</p>
      <p v-else>{{ t("shell.authGate.loginIntro") }}</p>

      <input
        v-if="status === 'join'"
        v-model="inviteCode"
        type="text"
        :placeholder="t('shell.authGate.inviteCodePlaceholder')"
        :aria-label="t('shell.authGate.inviteCodePlaceholder')"
      />
      <input
        v-if="status !== 'setup'"
        v-model="username"
        type="text"
        :placeholder="t('shell.authGate.usernamePlaceholder')"
        :aria-label="t('shell.authGate.usernamePlaceholder')"
        autocomplete="username"
      />
      <div class="password-row">
        <input
          v-model="password"
          :type="passwordVisible ? 'text' : 'password'"
          :placeholder="t('shell.authGate.passwordPlaceholder')"
          :aria-label="t('shell.authGate.passwordPlaceholder')"
          autocomplete="current-password"
          @keyup.enter="submit"
        />
        <Button
          variant="secondary"
          :aria-label="passwordVisible ? t('shell.authGate.hidePassword') : t('shell.authGate.showPassword')"
          @click="passwordVisible = !passwordVisible"
        >
          <AppIcon :name="passwordVisible ? 'eye-off' : 'eye'" />
        </Button>
      </div>
      <p v-if="error" class="error">{{ error }}</p>
      <Button
        size="lg"
        block
        :disabled="submitting || !password.trim() || (status !== 'setup' && !username.trim()) || (status === 'join' && !inviteCode.trim())"
        @click="submit"
      >
        {{
          submitting
            ? t("shell.authGate.submitting")
            : status === "setup"
              ? t("shell.authGate.submitSetup")
              : status === "join"
                ? t("shell.authGate.submitJoin")
                : t("shell.authGate.submitLogin")
        }}
      </Button>
      <p v-if="status === 'login'" class="hint">
        {{ t("shell.authGate.forgotPasswordHint") }}
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
