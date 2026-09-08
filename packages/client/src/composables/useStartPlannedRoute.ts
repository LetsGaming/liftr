import { ref } from "vue";
import type { PlannedRoute } from "../services/plannedRouteService";

/** Quick-start hand-off: starts nothing live (the app has no live GPS tracking anywhere) — just
 *  pre-fills the existing manual-entry form with a route's known distance/elevation so the user
 *  only has to confirm duration and date once they've actually run it. Mirrors "start a routine
 *  pre-fills expected sets" exactly. */
export function useStartPlannedRoute() {
  const activeRoute = ref<PlannedRoute | null>(null);

  function start(route: PlannedRoute) {
    activeRoute.value = route;
  }
  function dismiss() {
    activeRoute.value = null;
  }
  return { activeRoute, start, dismiss };
}
