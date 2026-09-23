/**
 * Health Connect status/import card. Native-only (Android), so the whole card is hidden on
 * web/iOS builds rather than shown broken (see isHealthConnectAvailable() re-export). Permission
 * grant here; the actual import check then also happens automatically on every app resume (see
 * syncStore.ts) — `healthConnectConnected` tracks which state the button is in (see its own
 * comment) so that's visible in the UI instead of both states sharing one "verbinden" label.
 * Extracted out of ProfilePage.vue — that file mixed six+ unrelated settings concerns together.
 */
import { ref } from "vue";
import { refreshCardioDerivedStores } from "./useCardioDerivedStores";
import {
  checkHealthConnectPermissions,
  importNewHealthConnectWorkouts,
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
} from "../health/healthConnect";
import { ApiError } from "../lib/api";

export function useHealthConnectImport() {
  const healthConnectStatus = ref("");
  const healthConnectBusy = ref(false);
  // isHealthConnectAvailable() is async (it initializes the native plugin's lateinit client via
  // Health.isHealthAvailable() — see healthConnect.ts) so the card's v-if needs a resolved ref
  // rather than calling the async function directly in the template.
  const healthConnectAvailable = ref(false);
  // Drives the button's label ("Verbinden" vs "Jetzt synchronisieren") and the hint text below
  // it — without this, a user who already granted permission (so the button's only remaining
  // job is to trigger an immediate re-sync) saw the exact same "verbinden" wording as a first-time
  // connect, with nothing telling them this tap is a sync, not a fresh connection.
  const healthConnectConnected = ref(false);
  void isHealthConnectAvailable().then(async (v) => {
    healthConnectAvailable.value = v;
    if (v) healthConnectConnected.value = (await checkHealthConnectPermissions()).granted;
  });

  async function connectHealthConnect() {
    healthConnectBusy.value = true;
    try {
      const result = await requestHealthConnectPermissions();
      healthConnectConnected.value = result.granted;
      if (!result.granted) {
        healthConnectStatus.value =
          result.missing.length > 0
            ? `Bitte folgende Health-Connect-Freigaben aktivieren: ${result.missing.join(", ")}.`
            : "Health Connect ist nicht verfügbar.";
        return;
      }
      const { imported, skipped, failed } = await importNewHealthConnectWorkouts("manual");
      // Only an actual import changes XP/streak/rank — a no-op resync (nothing new to import) or
      // an all-skipped/all-failed run has nothing for these stores to reflect.
      if (imported > 0) refreshCardioDerivedStores();
      if (imported === 0 && failed === 0 && skipped === 0) {
        healthConnectStatus.value = "Verbunden — keine neuen Aktivitäten gefunden.";
      } else if (failed === 0 && skipped === 0) {
        healthConnectStatus.value = `Verbunden — ${imported} Aktivität${imported === 1 ? "" : "en"} synchronisiert.`;
      } else {
        const parts = [`${imported} synchronisiert`];
        if (skipped > 0) parts.push(`${skipped} übersprungen`);
        if (failed > 0) parts.push(`${failed} fehlgeschlagen`);
        healthConnectStatus.value = `Verbunden — ${parts.join(", ")}. Details im Protokoll.`;
      }
    } catch (err) {
      // ApiError carries the server's actual validation reason (see api.ts) — surfacing it here
      // (rather than the generic "POST ... failed: 400" from err.message) is what turned this
      // failure mode from "no further logs" into something the user (and support) can act on.
      healthConnectStatus.value = err instanceof ApiError && err.detail ? err.detail : err instanceof Error ? err.message : "Verbindung fehlgeschlagen.";
    } finally {
      healthConnectBusy.value = false;
    }
  }

  return {
    healthConnectStatus,
    healthConnectBusy,
    healthConnectAvailable,
    healthConnectConnected,
    connectHealthConnect,
  };
}
