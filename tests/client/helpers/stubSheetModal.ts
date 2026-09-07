import { defineComponent, h } from "vue";
import { vi } from "vitest";

/**
 * SheetModal.vue wraps @ionic/vue's real `IonModal` component (imported and used directly, not
 * a raw `<ion-modal>` tag) — that's enough for @ionic/vue's Stencil-backed custom element to
 * self-register and "hydrate" under jsdom (unlike the *unresolved* hyphenated-tag case
 * tests/README.md describes), but it never actually projects its default/header slot content
 * into visible light DOM without the real native runtime driving its open/present lifecycle.
 * Verified empirically: mounting a component that renders `<IonModal><p>Body</p></IonModal>`
 * produces `<ion-modal ...></ion-modal>` with no children at all, so anything nested inside a
 * SheetModal is otherwise untestable.
 *
 * Stubs the *whole* SheetModal (not just the inner IonModal) — a simpler, coarser alternative to
 * the IonModal-only stub tests/client/components/ui/SheetModal.test.ts and
 * tests/client/components/exercise/ExerciseInfoPanel.test.ts use on themselves (which lets the
 * real SheetModal run and gets its actual dismiss()/did-dismiss/close plumbing for free). Reach
 * for that pattern instead when a test cares about SheetModal's own header/close-button/dismiss
 * behavior specifically; this one is enough for callers that only care about their own slot
 * content and their own pick/save/remove logic. Exposes the one method those callers actually
 * invoke — `sheetRef.value?.dismiss()` — as a spy, so a test can assert a pick/save/remove
 * interaction closes the sheet without depending on Ionic's real async teardown timing.
 */
export function stubSheetModal() {
  const dismiss = vi.fn();
  const SheetModalStub = defineComponent({
    name: "SheetModal",
    props: {
      title: { type: String, default: undefined },
      width: { type: String, default: undefined },
      desktopWidth: { type: String, default: undefined },
      height: { type: String, default: undefined },
      desktopHeight: { type: String, default: undefined },
      maxWidth: { type: String, default: undefined },
      background: { type: String, default: undefined },
      sheet: { type: Boolean, default: undefined },
      desktopVariant: { type: String, default: undefined },
      backdropDismiss: { type: Boolean, default: undefined },
    },
    emits: ["close"],
    methods: { dismiss },
    render() {
      return h("div", { class: "sheet-modal-stub" }, [
        this.$slots.header ? this.$slots.header() : null,
        this.$slots.default ? this.$slots.default() : null,
      ]);
    },
  });
  return { SheetModalStub, dismiss };
}
