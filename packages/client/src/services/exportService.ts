import { apiBase, getToken } from "../lib/api";

/** Raw fetch + blob, not the shared `api` wrapper (JSON-only) — this needs the bearer header
 *  but returns a binary zip, not JSON. */
export async function fetchExportZip(): Promise<Blob> {
  const res = await fetch(apiBase() + "/api/export.zip", {
    headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : {},
  });
  if (!res.ok) throw new Error(`Export fehlgeschlagen: ${res.status}`);
  return res.blob();
}
