import { api, apiBase, getToken } from "../lib/api";

export interface RunPoint {
  idx: number;
  t: string;
  lat: number;
  lon: number;
  ele: number | null;
  hr: number | null;
  cadence: number | null;
}

export interface RunSummary {
  id: string;
  source: "gpx" | "fit" | "manual" | "healthconnect";
  name: string | null;
  startedAt: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
}

export interface RunDetail extends RunSummary {
  points: RunPoint[];
}

export function getRuns(): Promise<RunSummary[]> {
  return api.get<RunSummary[]>("/api/runs");
}

export function getRunDetail(id: string): Promise<RunDetail> {
  return api.get<RunDetail>(`/api/runs/${id}`);
}

/** Multipart upload — the one call in this service that can't go through the shared `api`
 *  wrapper (JSON-only), so it builds the request directly, same auth-header convention as
 *  every other call. */
export async function importRunFile(file: File): Promise<RunSummary> {
  const token = getToken();
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(apiBase() + "/api/runs/import", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail ?? body.error ?? `import failed: ${res.status}`);
  }
  return (await res.json()) as RunSummary;
}

export function logManualRun(input: { name: string | null; startedAt: string; distanceM: number; durationS: number }): Promise<RunSummary> {
  return api.post("/api/runs", input);
}

/** Feedback: "not possible to delete past runs". Runs don't feed XP/LP (only logged sets do),
 *  so unlike workout deletion there's nothing to recompute server-side. */
export function deleteRun(id: string): Promise<void> {
  return api.del(`/api/runs/${id}`);
}
