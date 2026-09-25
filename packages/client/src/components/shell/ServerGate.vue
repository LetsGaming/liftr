<script setup lang="ts">
/**
 * Native-only server-connection gate, wrapping AuthGate.vue in App.vue (must resolve before
 * AuthGate can call anything, since apiBase() reads the URL this screen collects). No-op
 * passthrough on web/PWA — same-origin already gives the right server, nothing to ask.
 *
 * Trusts a previously-saved URL without re-verifying it on every launch (same model as Home
 * Assistant/Jellyfin's own server pickers) — AuthGate.vue's existing "offline" fallback already
 * covers "the saved server can't be reached right now" once past this gate.
 */
import { ref } from "vue";
import { useI18n } from "vue-i18n";
import { isNative } from "../../lib/platform";
import { useServerConnection } from "../../composables/useServerConnection";
import Button from "../base/Button.vue";

const { t } = useI18n();
const native = isNative();
const { serverUrl, checking, error, verifyAndSave } = useServerConnection();
const input = ref("");

function connect() {
  void verifyAndSave(input.value);
}
</script>

<template>
  <div v-if="native && !serverUrl" class="gate">
    <div class="card surface-hybrid">
      <h1>Liftr</h1>
      <p>{{ t("shell.serverGate.prompt") }}</p>
      <input
        v-model="input"
        type="text"
        :placeholder="t('shell.serverGate.placeholder')"
        :aria-label="t('profile.accountApp.server.addressAriaLabel')"
        autocapitalize="off"
        autocorrect="off"
        spellcheck="false"
        @keyup.enter="connect"
      />
      <p v-if="error" class="error">{{ error }}</p>
      <Button size="lg" block :disabled="checking || !input.trim()" @click="connect">
        {{ checking ? t("shell.serverGate.connecting") : t("shell.serverGate.connect") }}
      </Button>
    </div>
  </div>
  <slot v-else />
</template>

<style scoped>
/* Same look as AuthGate.vue's own gate/card — see that file's comments for why .surface-hybrid
   (not an opaque fill) and no background on .gate itself: this is the very first screen a native
   install shows, so it needs to let tokens.css's body::before cosmic sweep show through too. */
.gate {
  min-height: 100vh;
  display: grid;
  place-items: center;
}
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
  margin-bottom: var(--sp3);
}
.error {
  color: var(--danger);
  margin-bottom: var(--sp2);
}
</style>
