import { createRouter, createWebHistory } from "vue-router";

/**
 * Five destinations, matching the mockup's setPanel()/mGo() targets exactly (plan 1.2).
 * One codebase, two layouts: AppShell renders SideNav above the md breakpoint, TabBar below —
 * these routes are shared by both.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "overview", component: () => import("./pages/OverviewPage.vue") },
    { path: "/workout", name: "workout", component: () => import("./pages/WorkoutPage.vue") },
    { path: "/ranks", name: "ranks", component: () => import("./pages/RanksPage.vue") },
    {
      path: "/records",
      name: "records",
      component: () => import("./pages/RecordsPage.vue"),
      // Kick the PR fetch off as soon as navigation starts (not onMounted, which only runs once
      // the component actually mounts — see the beforeResolve prefetch comment below for why
      // that's too late) so data is already in flight while the chunk resolves and the outgoing
      // page's leave-transition plays.
      beforeEnter: () => {
        void import("./stores/prStore").then(({ usePrStore }) => usePrStore().load());
      },
    },
    { path: "/exercises", name: "exercises", component: () => import("./pages/ExercisesPage.vue") },
    { path: "/runs", name: "runs", component: () => import("./pages/RunsPage.vue") },
    { path: "/profile", name: "profile", component: () => import("./pages/ProfilePage.vue") },
    { path: "/attributions", name: "attributions", component: () => import("./pages/AttributionsPage.vue") },
  ],
});

// Blank-flash fix: App.vue wraps <RouterView> in <Transition mode="out-in"> (load-bearing for
// every other page transition — do not remove). With mode="out-in" the outgoing page fully
// unmounts and its leave-transition completes before the incoming route component even exists,
// so on a cold navigation (its lazy chunk not yet fetched) there's a real window where <main> is
// empty — no component is mounted yet to show even a visible skeleton. beforeResolve fires after
// all per-route guards but before the navigation is confirmed and the leave-transition starts, so
// awaiting every matched route's async component here guarantees the chunk has resolved (and is
// module-cached) before the outgoing page starts leaving. Generic across all routes, not just
// /records, so every lazy route benefits without touching App.vue's transition mode.
router.beforeResolve(async (to) => {
  await Promise.all(
    to.matched.flatMap((record) =>
      Object.values(record.components ?? {}).map((component) =>
        typeof component === "function" ? Promise.resolve((component as () => unknown)()) : undefined,
      ),
    ),
  );
});
