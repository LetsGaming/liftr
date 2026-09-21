import { defineComponent } from "vue";

/** Coarse stub for RouteMapEditor.vue (a real Leaflet-backed component, unusable under jsdom) —
 *  just enough surface (a rendered waypoint count) for tests/client/components/route-wizard/
 *  RouteWizard.test.ts to assert on how many waypoints the wizard hands it, without needing a
 *  real map. Split into its own file (rather than living inline in the test) so it doesn't
 *  trip `vue/one-component-per-file`, which — unlike `**\/*.vue` — still applies to plain `.ts`
 *  files under eslint-plugin-vue's flat "recommended" config. */
export const RouteMapEditorStub = defineComponent({
  name: "RouteMapEditor",
  props: {
    waypoints: { type: Array, required: true },
    routedPoints: { type: Array, default: undefined },
    approximate: { type: Boolean, default: undefined },
    closed: { type: Boolean, default: undefined },
    initialCenter: { type: Object, default: undefined },
  },
  emits: ["add", "move", "remove"],
  template: `<div class="map-stub" :data-count="waypoints.length"></div>`,
});
