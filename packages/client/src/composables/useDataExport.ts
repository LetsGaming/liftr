/**
 * CSV/ZIP backup — lets the user take their data with them, not just keep it offline-safe on the
 * server. Raw fetch + blob, same pattern as runsStore.importGpx, since this needs the bearer
 * header but isn't a JSON request/response (so it can't just be a plain link the system browser
 * opens — there'd be nowhere to attach the auth header). Extracted out of ProfilePage.vue — that
 * file mixed six+ unrelated settings concerns together.
 *
 * Handing the blob to `shareOrDownloadBlob` (native share sheet, then a real "Save As" dialog on
 * desktop, `<a download>` only as a last resort) rather than clicking a plain `<a download>`
 * ourselves — Capacitor's Android WebView is known to silently drop blob: downloads triggered
 * that way, so a bare `<a download>` here would fail exactly where this matters most.
 */
import { ref } from "vue";
import { shareOrDownloadBlob } from "../lib/shareCard";
import { fetchExportZip } from "../services/exportService";

export function useDataExport() {
  const exporting = ref(false);
  const exportError = ref("");

  async function exportData() {
    exporting.value = true;
    exportError.value = "";
    try {
      const blob = await fetchExportZip();
      await shareOrDownloadBlob(blob, `liftr-export-${new Date().toISOString().slice(0, 10)}.zip`, "Mein Liftr-Backup");
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : "Export fehlgeschlagen";
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportError, exportData };
}
