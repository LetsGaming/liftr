<script setup lang="ts">
import { onBeforeUnmount, ref } from "vue";
import AppIcon from "./AppIcon.vue";

defineProps<{
  ariaLabel?: string;
}>();

const isOpen = ref(false);

function toggleMenu() {
  isOpen.value = !isOpen.value;
}

function closeMenu() {
  isOpen.value = false;
}

function onDocumentClick(event: MouseEvent) {
  if (!isOpen.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".app-dropdown-wrap")) return;
  isOpen.value = false;
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === "Escape" && isOpen.value) {
    isOpen.value = false;
  }
}

if (typeof window !== "undefined") {
  document.addEventListener("click", onDocumentClick);
  document.addEventListener("keydown", onDocumentKeydown);
  onBeforeUnmount(() => {
    document.removeEventListener("click", onDocumentClick);
    document.removeEventListener("keydown", onDocumentKeydown);
  });
}

defineExpose({
  close: closeMenu,
});
</script>

<template>
  <div class="app-dropdown-wrap">
    <button
      class="app-dropdown-btn"
      :aria-label="ariaLabel ?? 'Mehr'"
      :aria-expanded="isOpen"
      @click.stop="toggleMenu"
    >
      <AppIcon name="more" />
    </button>
    <div v-if="isOpen" class="app-dropdown-menu" @click="closeMenu">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.app-dropdown-wrap {
  position: relative;
  flex: none;
}

.app-dropdown-btn {
  width: 44px;
  height: 44px;
  border-radius: var(--r-md);
  background: var(--surface-3);
  border: 1px solid var(--line);
  color: var(--dim);
  font-size: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.app-dropdown-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: 160px;
  background: var(--surface-3);
  border: 1px solid var(--line-2);
  border-radius: var(--r-md);
  box-shadow: var(--shadow);
  overflow: hidden;
}

:deep(.app-dropdown-menu button) {
  display: flex;
  align-items: center;
  gap: var(--sp2);
  padding: 10px 14px;
  text-align: left;
  font-size: 13px;
  color: var(--text);
  background: none;
  border: none;
  width: 100%;
  cursor: pointer;
}

:deep(.app-dropdown-menu button:hover) {
  background: var(--surface-2);
}

:deep(.app-dropdown-menu button.danger) {
  color: var(--danger);
}

:deep(.app-dropdown-menu button.danger.confirming) {
  background: var(--danger-lo);
  color: var(--text);
  font-weight: 700;
}
</style>
