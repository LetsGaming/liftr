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
    { path: "/exercises", name: "exercises", component: () => import("./pages/ExercisesPage.vue") },
    { path: "/runs", name: "runs", component: () => import("./pages/RunsPage.vue") },
    { path: "/profile", name: "profile", component: () => import("./pages/ProfilePage.vue") },
    { path: "/attributions", name: "attributions", component: () => import("./pages/AttributionsPage.vue") },
  ],
});
