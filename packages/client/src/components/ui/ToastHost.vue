<script setup lang="ts">
/** Renders whatever useToast.ts's shared queue currently holds — mount exactly once (App.vue),
 *  every caller elsewhere just calls useToast().toast(...). Bottom-center, above the mobile tab
 *  bar/desktop content, so it never covers the action that triggered it. */
import { useToast } from "../../composables/useToast";

const { toasts, dismiss } = useToast();

function handleClick(id: number, onClick: () => void) {
  onClick();
  dismiss(id);
}
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <button
        v-for="t in toasts"
        :key="t.id"
        type="button"
        class="toast"
        :class="{ 'toast--actionable': !!t.onClick }"
        :disabled="!t.onClick"
        @click="t.onClick && handleClick(t.id, t.onClick)"
      >
        {{ t.text }}
      </button>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-host {
  position: fixed;
  left: 0;
  right: 0;
  bottom: calc(var(--sp6) + env(safe-area-inset-bottom, 0px));
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--sp2);
  pointer-events: none;
  z-index: 500;
}
.toast {
  padding: 10px 18px;
  border-radius: 999px;
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  color: var(--text);
  font: inherit;
  font-size: 13.5px;
  font-weight: 700;
  box-shadow: var(--shadow);
  pointer-events: none;
}
.toast--actionable {
  pointer-events: auto;
  cursor: pointer;
}
.toast-enter-active,
.toast-leave-active {
  transition: transform var(--dur-base) var(--ease-out), opacity var(--dur-base) var(--ease-out);
}
.toast-enter-from {
  transform: translateY(12px);
  opacity: 0;
}
.toast-leave-to {
  transform: translateY(-8px);
  opacity: 0;
}
</style>
