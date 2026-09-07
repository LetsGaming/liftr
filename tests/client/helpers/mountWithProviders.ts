import { mount } from "@vue/test-utils";
import { createPinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { i18n } from "~client/i18n";

/** A router with no real routes — just enough for components that call useRouter()/useRoute()
 *  or render <router-link> without needing the app's real lazy-loaded pages. Tests that assert
 *  on actual navigation should build their own router with the routes they need. */
export function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: "/:pathMatch(.*)*", name: "test-root", component: { template: "<div />" } }],
  });
}

/** Mounts with a fresh pinia + the real i18n instance (actual `de` translation strings, so text
 *  assertions match production copy) + a stub router. Ionic's ion-* tags need no special
 *  handling — Vue's compiler already renders unresolved hyphenated tags as plain custom
 *  elements, so they show up in jsdom without the real Stencil runtime; if a component reads
 *  properties/methods Ionic itself would set, stub that specific element instead.
 *
 *  Generic over `T` (mirroring `mount`'s own type parameters via TS's `typeof fn<T>`
 *  instantiation-expression syntax) rather than the non-generic `Parameters<typeof mount>[0]`
 *  a plain passthrough signature would use — the latter collapses `mount`'s overloaded, component-
 *  specific prop typing into one loose union, so callers' `wrapper.setProps({...})` would no
 *  longer know the mounted component's actual prop names/types. */
export function mountWithProviders<T>(
  component: T,
  options: NonNullable<Parameters<typeof mount<T>>[1]> = {} as NonNullable<Parameters<typeof mount<T>>[1]>,
): ReturnType<typeof mount<T>> {
  const pinia = createPinia();
  const router = createTestRouter();
  return mount(component, {
    ...options,
    global: {
      plugins: [pinia, i18n, router],
      ...options?.global,
    },
  }) as ReturnType<typeof mount<T>>;
}
