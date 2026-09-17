/**
 * Health Connect status/import card. Native-only (Android), so the whole card is hidden on
 * web/iOS builds rather than shown broken (see isHealthConnectAvailable() re-export). One-time
 * permission grant here; the actual import check then happens automatically on every app resume
 * (see syncStore.ts). Extracted out of ProfilePage.vue — that file mixed six+ unrelated settings
 * concerns together.
 */
import { ref } from "vue";
import {
  importNewHealthConnectWorkouts,
  isHealthConnectAvailable,
  requestHealthConnectPermissions,
} from "../health/healthConnect";

export function useHealthConnectImport() {
  const healthConnectStatus = ref("");
  const healthConnectBusy = ref(false);
  // isHealthConnectAvailable() is async (it initializes the native plugin's lateinit client via
  // Health.isHealthAvailable() — see healthConnect.ts) so the card's v-if needs a resolved ref
  // rather than calling the async function directly in the template.
  const healthConnectAvailable = ref(false);
  void isHealthConnectAvailable().then((v) => (healthConnectAvailable.value = v));

  async function connectHealthConnect() {
    healthConnectBusy.value = true;
    try {
      const granted = await requestHealthConnectPermissions();
      if (!granted) {
        healthConnectStatus.value = "Health Connect hat nicht alle Freigaben bekommen — bitte in den Health-Connect-Einstellungen nachtragen.";
        return;
      }
      const count = await importNewHealthConnectWorkouts();
      healthConnectStatus.value = count > 0 ? `${count} Lauf/Läufe importiert.` : "Verbunden — keine neuen Läufe gefunden.";
    } catch (err) {
      healthConnectStatus.value = err instanceof Error ? err.message : "Verbindung fehlgeschlagen.";
    } finally {
      healthConnectBusy.value = false;
    }
  }

  return { healthConnectStatus, healthConnectBusy, healthConnectAvailable, connectHealthConnect };
}
