/**
 * CSV/ZIP backup — lets the user take their data with them, not just keep it offline-safe on the
 * server. Raw fetch + blob, same pattern as runsStore.importGpx, since this needs the bearer
 * header but isn't a JSON request/response. Extracted out of ProfilePage.vue — that file mixed
 * six+ unrelated settings concerns together.
 */
import { ref } from "vue";
import { fetchExportZip } from "../services/exportService";

export function useDataExport() {
  const exporting = ref(false);
  const exportError = ref("");

  async function exportData() {
    exporting.value = true;
    exportError.value = "";
    try {
      const blob = await fetchExportZip();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `liftr-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      exportError.value = err instanceof Error ? err.message : "Export fehlgeschlagen";
    } finally {
      exporting.value = false;
    }
  }

  return { exporting, exportError, exportData };
}
