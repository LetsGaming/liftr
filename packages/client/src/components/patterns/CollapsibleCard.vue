<script setup lang="ts">
/**
 * Header-button + chevron disclosure for a settings card's *contents* — the card frame itself
 * (`.card.surface-hybrid`) stays on the host `<section>` so the pop-in stagger
 * (`:nth-of-type` in ProfilePage.vue) keeps counting real `<section>` siblings. Same shape as
 * TierLadder.vue's rung disclosure (aria-expanded + rotating chevron), just for a single
 * always-available section instead of an accordion list.
 *
 * `v-show` (not `v-if`) on the body — collapsing a card with unsaved form input shouldn't lose
 * it.
 */
const props = defineProps<{ title: string; defaultOpen?: boolean }>();
// Collapsed by default (or open via `defaultOpen`); a parent can also bind v-model:open to force
// it open, e.g. jumping here from a notification elsewhere in the app.
const open = defineModel<boolean>("open", { default: false });
if (props.defaultOpen) open.value = true;
</script>

<template>
  <button type="button" class="collapsible-head" :aria-expanded="open" @click="open = !open">
    <h2 class="eyebrow">{{ title }}</h2>
    <svg
      class="chevron"
      :class="{ open }"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  </button>
  <div v-show="open" class="collapsible-body">
    <slot />
  </div>
</template>

<style scoped>
.collapsible-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp2);
  width: 100%;
  /* Native <button> UA defaults (white background, border, black text) — every other button in
     the app resets these (see InfoToggle.vue's identical rule), missed here initially and
     visible as a white pill around the card title in a mobile-viewport check. */
  background: none;
  border: none;
  text-align: left;
  font: inherit;
  color: inherit;
}
.collapsible-head .eyebrow {
  margin: 0;
}
.chevron {
  width: 18px;
  height: 18px;
  flex: none;
  color: var(--faint);
  transition: transform var(--dur-fast) var(--ease-out);
}
.chevron.open {
  transform: rotate(180deg);
}
.collapsible-body {
  margin-top: var(--sp3);
}
</style>
