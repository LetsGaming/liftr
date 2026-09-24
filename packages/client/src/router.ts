import { createRouter, createWebHistory } from "vue-router";

declare module "vue-router" {
  interface RouteMeta {
    /** Drives App.vue's sr-only <h1> and the routes below with no navItems entry of their own
     *  (App.vue's own pageTitle special-cases handle every other title source: navItems' nav
     *  labels, /runs, and the dynamic per-routine title). */
    title?: string;
    /** True for every route whose page renders BasePage with `back-button` — App.vue's
     *  `hideTopHud` reads this to suppress the mobile top-hud (level ring/streak chip) there,
     *  since it's pinned to the exact same top-left/top-right corners as BasePage's own back
     *  button and header-actions slot (see App.vue's hideTopHud doc comment for why z-index
     *  alone doesn't actually keep them visually apart). */
    backButton?: boolean;
  }
}

/**
 * One codebase, two layouts: AppShell renders SideNav above the md breakpoint, TabBar below —
 * these routes are shared by both.
 */
export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/", name: "overview", component: () => import("./pages/OverviewPage.vue") },
    { path: "/workout", name: "workout", component: () => import("./pages/WorkoutPage.vue") },
    {
      path: "/routines/:id",
      name: "routine-overview",
      component: () => import("./pages/RoutineOverviewPage.vue"),
      meta: { backButton: true },
      // Kicks the routine fetch off as soon as navigation starts (routineStore.load() is cheap
      // to call again; it always re-fetches the full list) so data is in flight while the chunk
      // resolves, rather than waiting for onMounted after the leave-transition already started.
      beforeEnter: () => {
        void import("./stores/routineStore").then(({ useRoutineStore }) => useRoutineStore().load());
      },
    },
    {
      path: "/routes/:id",
      name: "route-overview",
      component: () => import("./pages/RouteOverviewPage.vue"),
      meta: { backButton: true },
      // Same eager-prefetch pattern as /routines/:id above — get the fetch in flight while the
      // route's own chunk resolves, rather than waiting for onMounted.
      beforeEnter: () => {
        void import("./stores/plannedRouteStore").then(({ usePlannedRouteStore }) => usePlannedRouteStore().load());
      },
    },
    { path: "/ranks", name: "ranks", component: () => import("./pages/RanksPage.vue") },
    {
      path: "/records",
      name: "records",
      component: () => import("./pages/RecordsPage.vue"),
      meta: { title: "Rekorde", backButton: true },
      // Kick the PR fetch off as soon as navigation starts (not onMounted, which only runs once
      // the component actually mounts — see the beforeResolve prefetch comment below for why
      // that's too late) so data is already in flight while the chunk resolves and the outgoing
      // page's leave-transition plays.
      beforeEnter: () => {
        void import("./stores/prStore").then(({ usePrStore }) => usePrStore().load());
      },
    },
    { path: "/exercises", name: "exercises", component: () => import("./pages/ExercisesPage.vue") },
    {
      path: "/exercises/:slug",
      name: "exercise-detail",
      component: () => import("./pages/ExerciseDetailPage.vue"),
      meta: { title: "Übung", backButton: true },
      // Same eager-prefetch pattern as /records above — get the fetch in flight while the chunk
      // resolves. Guarded on !loaded (matching ExerciseDetailPage.vue's own onMounted guard and
      // /records' prStore prefetch) since catalogStore.load() always re-fetches the whole
      // exercise catalog, unlike prStore/historyStore's own per-id caching.
      beforeEnter: () => {
        void import("./stores/catalogStore").then(({ useCatalogStore }) => {
          const catalog = useCatalogStore();
          if (!catalog.loaded) void catalog.load();
        });
      },
    },
    { path: "/runs", name: "runs", component: () => import("./pages/RunsPage.vue") },
    {
      path: "/workouts/:id",
      name: "workout-detail",
      component: () => import("./pages/WorkoutDetailPage.vue"),
      meta: { title: "Workout-Details", backButton: true },
      // Same eager-prefetch pattern as /records and /exercises/:slug above — historyStore.loadWorkout()
      // is safe to call again here even though the page's own onMounted calls it too: it's cached
      // per id (see historyStore.ts), so a concurrent call while this one is still in flight is the
      // only case that ever does two fetches, not a guaranteed double-fetch.
      beforeEnter: (to) => {
        void import("./stores/historyStore").then(({ useHistoryStore }) => useHistoryStore().loadWorkout(to.params.id as string));
      },
    },
    {
      path: "/runs/:id",
      name: "run-detail",
      component: () => import("./pages/RunDetailPage.vue"),
      meta: { title: "Lauf-Details", backButton: true },
      beforeEnter: (to) => {
        void import("./stores/runsStore").then(({ useRunsStore }) => useRunsStore().loadDetail(to.params.id as string));
      },
    },
    { path: "/profile", name: "profile", component: () => import("./pages/ProfilePage.vue") },
    {
      path: "/attributions",
      name: "attributions",
      component: () => import("./pages/AttributionsPage.vue"),
      meta: { title: "Quellen & Lizenzen", backButton: true },
    },
    {
      path: "/diagnostics",
      name: "diagnostics",
      component: () => import("./pages/DiagnosticsPage.vue"),
      meta: { title: "Diagnose", backButton: true },
    },
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
