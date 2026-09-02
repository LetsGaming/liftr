<script setup lang="ts">
/**
 * Auth entry screen (closes the "no UI to enter the bearer token" gap, plan 1.1/audit §5).
 * The server enforces a single bearer token when LIFTR_TOKEN is set; this component checks
 * once on boot, and shows a blocking prompt only if that check comes back 401. In dev, where
 * LIFTR_TOKEN is unset, the health check succeeds with no token and this never shows —
 * matches the "present, not elaborate" design intent, not a login wall for its own sake.
 */
import { onMounted, ref } from "vue";
import { ApiError, api, setToken } from "../../lib/api";

const status = ref<"checking" | "ok" | "needs-token" | "offline">("checking");
const tokenInput = ref("");
const submitting = ref(false);
const error = ref<string | null>(null);

async function check() {
  status.value = "checking";
  try {
    await api.get("/api/health");
    status.value = "ok";
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      status.value = "needs-token";
    } else {
      // offline on first load with no cached auth state — let the app through; the PWA
      // shell + cached catalog still work, and API calls will retry once online (plan 1.3).
      status.value = "offline";
    }
  }
}

onMounted(check);

async function submit() {
  submitting.value = true;
  error.value = null;
  setToken(tokenInput.value.trim());
  try {
    await api.get("/api/health");
    status.value = "ok";
  } catch {
    error.value = "Token abgelehnt — bitte prüfen.";
    status.value = "needs-token";
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div v-if="status === 'needs-token'" class="gate">
    <div class="card">
      <h1>Liftr</h1>
      <p>Dieser Server ist mit einem Token gesichert.</p>
      <input
        v-model="tokenInput"
        type="password"
        placeholder="Token"
        aria-label="API-Token"
        @keyup.enter="submit"
      />
      <p v-if="error" class="error">{{ error }}</p>
      <button class="btn-primary btn-lg btn-block" :disabled="submitting || !tokenInput.trim()" @click="submit">
        {{ submitting ? "Prüfe…" : "Entsperren" }}
      </button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background: var(--bg);
}
.card {
  background: var(--surface-2);
  border: 1px solid var(--line);
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
.card input {
  width: 100%;
  padding: 12px 14px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--text);
  font-size: 14px;
  margin-bottom: var(--sp3);
}
.error {
  color: var(--red);
}
</style>
