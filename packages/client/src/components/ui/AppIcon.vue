<script setup lang="ts">
/**
 * Centralizes every small functional icon (fire, trophy, star, dumbbell, run, trash, edit, link,
 * eye/eye-off, share, copy, skip, play/pause, warning, target, scale, check, close, ...) as one
 * component, matching App.vue's `navItems` convention exactly: 24x24 viewBox,
 * `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
 * stroke-linejoin="round"`, hand-authored static path data (never user input, so v-html here
 * carries no injection risk — same justification as App.vue's nav icons). `currentColor` means
 * every icon inherits the surrounding text color automatically in both themes.
 *
 * Sizing: the icon is `1em` square by default so it scales with the font-size of whatever text
 * it sits next to, and is nudged onto the text baseline via `vertical-align`. Pass `size` (px)
 * for icon-only contexts (buttons with no adjacent text, badges) where a fixed size reads better
 * than font-relative sizing.
 */
export type AppIconName =
  | "check"
  | "close"
  | "flame"
  | "trophy"
  | "sparkle"
  | "dumbbell"
  | "running"
  | "trash"
  | "edit"
  | "link"
  | "eye"
  | "eye-off"
  | "share"
  | "clipboard"
  | "skip-forward"
  | "play"
  | "pause"
  | "warning"
  | "target"
  | "scale"
  | "more"
  | "drag-handle"
  | "arrow-up"
  | "arrow-down"
  | "info";

const props = withDefaults(
  defineProps<{
    name: AppIconName;
    /** Fixed pixel size. Omit to size at 1em (inherits surrounding font-size). */
    size?: number;
  }>(),
  { size: undefined },
);

// Static, hand-authored SVG path data only — never derived from user input.
const PATHS: Record<AppIconName, string> = {
  check: '<path d="M5 12l4 4L19 7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  flame:
    '<path d="M12 3c-1.5 3-5 5-5 9a5 5 0 0010 0c0-1.5-.7-2.6-1.5-3.7.2 1.6-.6 2.7-1.5 2.7-1.2 0-1.6-1.2-1-2.3.7-1.3 1-3.2-1-5.7z"/>',
  trophy:
    '<path d="M7 4h10v2a5 5 0 01-10 0V4z"/><path d="M5 5H4a3 3 0 003 3M19 5h1a3 3 0 01-3 3"/><path d="M12 11v4"/><path d="M10 20v-3h4v3"/><path d="M9 20h6"/>',
  sparkle: '<path d="M12 2c.6 3.4 2 4.8 5 5-3 .6-4.4 2-5 5-.6-3-2-4.4-5-5 3-.6 4.4-1.6 5-5z"/>',
  dumbbell: '<path d="M4 9v6M20 9v6M7 7v10M17 7v10M9 12h6"/>',
  running:
    '<circle cx="14" cy="4" r="1.6" fill="currentColor" stroke="none"/><path d="M11 21l1.5-5.5-2.5-2 1-4.5 3.5 1.5 1.5 3 3-1.5"/><path d="M10 15l-3 1"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20l4-1 11-11-3-3L5 16l-1 4z"/><path d="M13 6l3 3"/>',
  link: '<path d="M9 15l6-6"/><path d="M8 12l-2 2a3 3 0 004 4l2-2"/><path d="M16 12l2-2a3 3 0 00-4-4l-2 2"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/>',
  "eye-off":
    '<path d="M3 3l18 18"/><path d="M10.6 5.2A10.7 10.7 0 0112 5c6.5 0 10 7 10 7a17.8 17.8 0 01-3.2 4.1M6.5 6.7C4 8.3 2 12 2 12s3.5 7 10 7a10 10 0 004.2-.9"/><path d="M9.9 9.9a3 3 0 004.2 4.2"/>',
  share: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M5 16v3a2 2 0 002 2h10a2 2 0 002-2v-3"/>',
  clipboard: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M9 4h6v2H9z"/>',
  "skip-forward": '<path d="M6 5l10 7-10 7z"/><path d="M18 5v14"/>',
  play: '<path d="M7 5l12 7-12 7z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  warning: '<path d="M12 3l10 18H2z"/><path d="M12 9v5"/><circle cx="12" cy="17" r="1" fill="currentColor" stroke="none"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
  scale: '<path d="M12 3v18M6 7h12"/><path d="M4 7l3 6a3 3 0 006 0L4 7"/><path d="M14 7l3 6a3 3 0 006 0l-3-6"/><path d="M8 21h8"/>',
  more:
    '<circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none"/>',
  "drag-handle": '<path d="M4 7h16M4 12h16M4 17h16"/>',
  "arrow-up": '<path d="M12 19V5"/><path d="M6 11l6-6 6 6"/>',
  "arrow-down": '<path d="M12 5v14"/><path d="M18 13l-6 6-6-6"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><circle cx="12" cy="8" r="0.9" fill="currentColor" stroke="none"/>',
};
</script>

<template>
  <!-- eslint-disable vue/no-v-html -- static, hand-authored SVG paths only, never user input, see header comment -->
  <svg
    class="app-icon"
    :class="`app-icon--${props.name}`"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    :style="props.size ? { width: `${props.size}px`, height: `${props.size}px` } : undefined"
    aria-hidden="true"
    v-html="PATHS[props.name]"
  ></svg>
  <!-- eslint-enable vue/no-v-html -->
</template>

<style scoped>
.app-icon {
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  flex-shrink: 0;
}
</style>
