/**
 * Manual run entry — form state, validation, and submit — extracted out of RunsPage.vue and
 * RouteOverviewPage.vue, which used to each carry their own near-identical copy of this (name/
 * date/distance/minutes refs, validateManualEntry() call, km/min parsing, runsStore.logManual()
 * payload). The two call sites differ only in what happens after a successful save (RunsPage
 * stays on the page and resets its own fields; RouteOverviewPage navigates to /runs) and in what
 * gets sent as name/plannedRouteId/elevationGainM (RunsPage has its own free-text name input and
 * no route; RouteOverviewPage derives all three from the planned route) — both are left to the
 * caller via `onSuccess` and `submitManual()`'s overrides — including the toast, whose ordering
 * relative to the rest of the post-save cleanup differs between the two call sites.
 */
import { ref } from "vue";
import { validateManualEntry } from "../lib/runValidation";
import { useRunsStore } from "../stores/runsStore";

export function useManualRunEntry(onSuccess: () => void | Promise<void>) {
  const runsStore = useRunsStore();

  const manualName = ref("");
  const manualDate = ref(new Date().toISOString().slice(0, 10));
  const manualDistanceKm = ref("");
  const manualMinutes = ref("");
  const manualError = ref<string | null>(null);
  const submitting = ref(false);

  async function submitManual(overrides?: {
    name?: string | null;
    plannedRouteId?: string | null;
    elevationGainM?: number | null;
  }) {
    const validationError = validateManualEntry(manualDistanceKm.value, manualMinutes.value, manualDate.value);
    if (validationError) {
      manualError.value = validationError;
      return;
    }
    const km = Number(manualDistanceKm.value.replace(",", "."));
    const min = Number(manualMinutes.value.replace(",", "."));
    submitting.value = true;
    try {
      await runsStore.logManual({
        name: overrides?.name !== undefined ? overrides.name : manualName.value || null,
        startedAt: new Date(manualDate.value + "T12:00:00").toISOString(),
        distanceM: km * 1000,
        durationS: min * 60,
        plannedRouteId: overrides?.plannedRouteId ?? null,
        elevationGainM: overrides?.elevationGainM ?? null,
      });
      manualError.value = null;
      await onSuccess();
    } catch (err) {
      // Genuine server/network failure only — client-side validation is handled above and never
      // reaches here (validateManualEntry() also guards the new Date(...) call above from ever
      // throwing on a bad manualDate, so this catch only sees real request failures).
      manualError.value = (err as Error).message;
    } finally {
      submitting.value = false;
    }
  }

  return { manualName, manualDate, manualDistanceKm, manualMinutes, manualError, submitting, submitManual };
}
