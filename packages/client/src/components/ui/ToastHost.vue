<script setup lang="ts">
/** Renders whatever useToast.ts's shared queue currently holds — mount exactly once (App.vue),
 *  every caller elsewhere just calls useToast().toast(...). Bottom-center, above the mobile tab
 *  bar/desktop content, so it never covers the action that triggered it. */
import { useToast } from "../../composables/useToast";

const { toasts } = useToast();
</script>

<template>
  <div class="toast-host" aria-live="polite">
    <TransitionGroup name="toast">
      <div v-for="t in toasts" :key="t.id" class="toast">{{ t.text }}</div>
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
  font-size: 13.5px;
  font-weight: 700;
  box-shadow: var(--shadow);
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
