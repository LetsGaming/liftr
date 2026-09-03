/**
 * Density-mode injection (2026-09-03 Foundation plan, Task 5) — lens-2 §4's three named density
 * levels (Train = lowest density/largest targets, Plan = form-dense, Progress = read-dense),
 * exposed as a reusable provide/inject pair so a screen's density is a single decision made once
 * at its root, not re-derived per component. Components.vue/ui/DensityScope.vue is the component
 * wrapper that calls `provideDensityMode`; most call sites should use that component directly
 * rather than calling `provideDensityMode` by hand.
 */
import { inject, provide, type InjectionKey } from "vue";

export type DensityMode = "train" | "plan" | "progress";

export const DENSITY_KEY: InjectionKey<DensityMode> = Symbol("liftr-density");

/** Reads the nearest ancestor DensityScope's mode. Defaults to "progress" (the read-dense,
 *  middle-ground level) when no DensityScope ancestor exists — e.g. a component rendered outside
 *  any density-scoped screen, or in isolation. */
export function useDensityMode(): DensityMode {
  return inject(DENSITY_KEY, "progress");
}

/** Registers this component's subtree as one density scope. Called by DensityScope.vue —
 *  most call sites should reach for that component instead of calling this directly. */
export function provideDensityMode(mode: DensityMode): void {
  provide(DENSITY_KEY, mode);
}
