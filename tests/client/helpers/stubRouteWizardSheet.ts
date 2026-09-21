import { defineComponent } from "vue";

/** Minimal SheetModal stub for tests/client/components/route-wizard/RouteWizard.test.ts — just
 *  the header/default slots plus a spy-backed `dismiss()`. Split into its own file (rather than
 *  living inline in the test, alongside stubRouteMapEditor.ts) so this file and the test file
 *  each define one component, satisfying `vue/one-component-per-file` — which, unlike
 *  `**\/*.vue`, still applies to plain `.ts` files under eslint-plugin-vue's flat "recommended"
 *  config. See tests/client/helpers/stubSheetModal.ts for a fuller-featured, prop-complete
 *  SheetModal stub used elsewhere; this one is intentionally narrower to match what
 *  RouteWizard.vue's own usage needs. */
export function createSheetModalStub(dismissSpy: () => void) {
  return defineComponent({
    emits: ["close"],
    methods: {
      dismiss() {
        dismissSpy();
        this.$emit("close");
      },
    },
    template: `<div class="sheet-stub"><slot name="header" /><div class="sheet-body"><slot /></div></div>`,
  });
}
