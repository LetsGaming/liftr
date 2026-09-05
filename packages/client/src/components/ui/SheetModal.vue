<script setup lang="ts">
/**
 * Shared modal shell — every modal in the app is built on this IonModal setup now (feedback:
 * "every modal should reuse the same base, this is currently not the case"). Originally only
 * ExerciseInfoPanel.vue and WorkoutDetail.vue used it (title + close button + one scrolling
 * body); RoutineWizard.vue kept its own hand-rolled `<IonModal>` with a custom multi-step
 * header, on the reasoning that its header shape was genuinely different. That reasoning was
 * right about the *header*, wrong about needing a whole separate shell for it — the `#header`
 * slot below lets a caller replace the title bar with anything (a step indicator, a name input,
 * whatever) while still going through the same IonModal sizing/background/dismiss plumbing.
 *
 * Two content shapes, chosen by the caller:
 *   - No `#header` slot: the original title+close bar, and the whole `.sheet` is one scrolling
 *     region (unchanged from before this file grew a second shape).
 *   - `#header` slot provided: that content renders pinned (flex:none) above a separate
 *     scrolling `.sheet-scroll` body — what a multi-step flow actually wants (the step
 *     indicator shouldn't scroll away).
 *
 * Two desktop shapes, chosen by `desktopVariant` (feedback: ExerciseInfoPanel and WorkoutDetail
 * "still differ" and WorkoutDetail "doesn't use enough width" — both used to fight this base's
 * own desktop rounded-corner default with their own `::part(content)` overrides, one becoming a
 * right-drawer, the other a centered card at a narrower fixed width, for no reason tied to their
 * actual content. Centralizing both shapes here means a caller picks one by name instead of
 * hand-rolling `::part()` CSS, and the two info/detail sheets can now deliberately share the
 * same drawer treatment instead of drifting independently):
 *   - "card" (default): rounded on every side, centered — a floating panel.
 *   - "drawer": square corners, pinned to the right edge, left border, full height — a
 *     reference panel meant to sit alongside the page behind it, not float over it.
 *
 * `desktopWidth`/`desktopHeight` are optional overrides of `width`/`height` for the ≥900px
 * breakpoint (falling back to the base value when unset) — implemented as a plain CSS custom-
 * property cascade inside this component's own stylesheet (`--sheet-width-desktop` feeding
 * `--width` via `var()` with a fallback), deliberately *not* by having a caller's own external
 * `@media` rule try to override this component's inline `:style` binding for the same property:
 * an inline style always wins that fight, so that pattern (what ExerciseInfoPanel used to do)
 * silently doesn't do anything.
 *
 * Closing (feedback: routine create/edit crashed with "Cannot read properties of null (reading
 * 'insertBefore')", and the workout-delete confirm got stuck). Root cause: every close path
 * here and in every caller was just emitting `close`/flipping the parent's own v-if straight
 * away, which unmounts this whole component — including the live `<ion-modal>` custom element —
 * while `:is-open` was still `true` and Ionic hadn't been told to close. Ionic's own dismiss()
 * does real async teardown (finishes any animation, detaches itself from the DOM in a
 * controlled order); yanking the element out from under it via Vue unmount races that teardown
 * and null-derefs. `@ionic/vue`'s `<IonModal>` doesn't expose a `dismiss()` method on its own
 * component instance (confirmed against the installed 9.0.0: no `defineExpose` anywhere in its
 * `defineOverlayContainer`) — the real method lives on the underlying custom element, reached
 * via the template ref's `.$el`. So: nothing in this file or its callers unmounts anything
 * directly. Every close path calls `dismiss()` below, which calls the *real* Ionic dismiss;
 * only its `@did-dismiss` callback (guaranteed to fire after Ionic's own teardown finishes)
 * emits `close`, and only *that* event is what callers use to actually unmount/reset state.
 *
 * 2026-09-05: `@did-dismiss` firing "after Ionic's own teardown finishes" turned out not to mean
 * "after Ionic's internal overlay-stack bookkeeping has fully detached the DOM subtree" — live
 * production-build investigation (`audit/workplan-v1.md` §3.6) captured a real
 * `insertBefore`-on-null crash happening *synchronously inside* the `did-dismiss` handler's own
 * call stack: emitting `close` here triggers the caller's reactive unmount in the same tick,
 * which can race Ionic's own cleanup of that same subtree. `requestAnimationFrame` (not
 * `nextTick`, which can still land in the same microtask queue Ionic's teardown promise resolves
 * through) gives real separation from that race for every caller at once.
 */
import { IonModal } from "@ionic/vue";
import { ref, useSlots } from "vue";

withDefaults(
  defineProps<{
    title?: string;
    width?: string;
    desktopWidth?: string;
    height?: string;
    desktopHeight?: string;
    maxWidth?: string;
    background?: string;
    /** true (default): a native draggable bottom sheet (breakpoints [0,1]) — the info/detail-
     *  panel shape. false: a static full-bleed modal with no drag handle, always square-
     *  cornered regardless of `desktopVariant` — what a full-screen flow like the routine
     *  wizard wants; dragging it partway closed mid-edit would be a bad time to discover your
     *  draft is gone. */
    sheet?: boolean;
    desktopVariant?: "card" | "drawer";
    /** Native Ionic tap-outside-to-close. Defaults to `sheet`'s own value (a draggable sheet
     *  naturally dismisses on backdrop tap too; a static full-bleed flow like the wizard
     *  shouldn't, since that would bypass whatever confirm-before-discarding guard the caller
     *  built around its own close button). Set explicitly to override either way. */
    backdropDismiss?: boolean;
  }>(),
  {
    title: "",
    width: "100%",
    desktopWidth: undefined,
    height: "100%",
    desktopHeight: undefined,
    maxWidth: undefined,
    background: "var(--surface)",
    sheet: true,
    desktopVariant: "card",
    backdropDismiss: undefined,
  },
);
const emit = defineEmits<{ close: [] }>();
const slots = useSlots();

const modalRef = ref<InstanceType<typeof IonModal> | null>(null);
/** The one correct way to close this modal — see the header comment. Exposed so a caller can
 *  close it in response to its own action (e.g. "delete succeeded", "nothing to save") instead
 *  of reaching into its own v-if/emit directly. */
function dismiss() {
  void (modalRef.value as unknown as { $el?: { dismiss: () => Promise<boolean> } } | null)?.$el?.dismiss();
}
/** See this file's header comment (2026-09-05 update) for why `close` is deferred a frame past
 *  `did-dismiss` instead of emitted directly from the template. */
function onDidDismiss() {
  window.requestAnimationFrame(() => emit("close"));
}
defineExpose({ dismiss });
</script>

<template>
  <IonModal
    ref="modalRef"
    class="sheet-modal"
    :class="{
      'full-modal': !sheet,
      'card-modal': sheet && desktopVariant === 'card',
      'drawer-modal': sheet && desktopVariant === 'drawer',
    }"
    :style="{
      '--sheet-width': width,
      '--sheet-width-desktop': desktopWidth,
      '--sheet-height': height,
      '--sheet-height-desktop': desktopHeight,
      '--max-width': maxWidth,
      '--modal-bg': background,
    }"
    :is-open="true"
    :breakpoints="sheet ? [0, 1] : undefined"
    :initial-breakpoint="sheet ? 1 : undefined"
    :backdrop-dismiss="backdropDismiss ?? sheet"
    @did-dismiss="onDidDismiss"
  >
    <div class="sheet" :class="{ 'has-custom-header': !!slots.header }">
      <template v-if="slots.header">
        <slot name="header" />
        <div class="sheet-scroll"><slot /></div>
      </template>
      <template v-else>
        <div class="sheet-head">
          <b>{{ title }}</b>
          <button class="btn-close" aria-label="Schließen" @click="dismiss">✕</button>
        </div>
        <slot />
      </template>
    </div>
  </IonModal>
</template>

<style>
/* IonModal's internal parts render outside this component's scoped-CSS reach. --width and
   --height are computed from the --sheet-width(-desktop) / --sheet-height(-desktop) inline
   inputs above, not bound directly — see this file's header comment for why. */
.sheet-modal {
  --background: var(--modal-bg);
  --width: var(--sheet-width);
  --height: var(--sheet-height);
}
.sheet-modal.drawer-modal::part(content) {
  /* Square at every breakpoint — a drawer collapses to a full-bleed sheet on mobile, which
     shouldn't have rounded corners either. */
  border-radius: 0;
}
@media (min-width: 900px) {
  .sheet-modal {
    --width: var(--sheet-width-desktop, var(--sheet-width));
    --height: var(--sheet-height-desktop, var(--sheet-height));
  }
  .sheet-modal.card-modal::part(content) {
    border-radius: var(--r-xl);
  }
  .sheet-modal.drawer-modal::part(content) {
    margin-left: auto;
    margin-right: 0;
    border-left: 1px solid var(--line-2);
  }
}
</style>
<style scoped>
.sheet {
  height: 100%;
  display: flex;
  flex-direction: column;
}
.sheet:not(.has-custom-header) {
  padding: var(--sp5);
  overflow-y: auto;
}
.sheet.has-custom-header {
  overflow: hidden;
}
.sheet-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--sp4);
}
.sheet-head {
  flex: none;
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp4);
}
.sheet-head b {
  font-size: 17px;
}
</style>
