import { defineComponent, h } from "vue";
import { mount } from "@vue/test-utils";

/** Runs a composable inside a real component's `setup()` so lifecycle hooks (onMounted,
 *  onUnmounted, watch, useI18n/inject, ...) behave exactly as they do in production instead of
 *  warning/throwing when called bare outside a component instance. Returns the composable's
 *  return value plus the mounted wrapper's `unmount()` so tests can assert on unmount-triggered
 *  cleanup (e.g. a timer cleared in onUnmounted). Mounting needs a real DOM, so any test file
 *  using this needs `// @vitest-environment jsdom` (composables/ isn't covered by the
 *  jsdom `environmentMatchGlobs` glob in vitest.config.ts). */
export function withSetup<T>(
  composable: () => T,
  options?: Parameters<typeof mount>[1],
): { result: T; unmount: () => void } {
  let result!: T;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = composable();
        return () => h("div");
      },
    }),
    options,
  );
  return { result, unmount: () => wrapper.unmount() };
}
