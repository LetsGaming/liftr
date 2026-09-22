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

/** One fix from useLiveRun.ts's live-tracking recorder — same shape as RunPoint minus the
 *  server-assigned `idx` (ordering is implicit: array order === recording order). */
export interface PhoneGpsRunPoint {
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
  /** "run"/"walk"/"hike" get their own rank ladder; "other" earns XP + streak only. See
   *  @liftr/shared's cardioActivities.ts for the full registry. */
  activityType: "run" | "walk" | "hike" | "other";
  name: string | null;
  startedAt: string;
  distanceM: number;
  durationS: number;
  avgPaceSPerKm: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
  plannedRouteId: string | null;
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

/** Turns a live-tracked point buffer into a minimal single-segment GPX 1.1 document, so a
 *  phone-GPS live run can go through the exact same server-side import pipeline (parse ->
 *  plausibility gate -> rank recompute) a real GPX file upload does, instead of a second,
 *  parallel ingestion path that would need to re-implement all of that gating itself. */
function buildGpxFromPoints(points: PhoneGpsRunPoint[]): string {
  const trkpts = points
    .map((p) => {
      const ele = p.ele != null ? `<ele>${p.ele}</ele>` : "";
      return `<trkpt lat="${p.lat}" lon="${p.lon}">${ele}<time>${p.t}</time></trkpt>`;
    })
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="liftr"><trk><trkseg>${trkpts}</trkseg></trk></gpx>`;
}

export function submitLiveRun(input: { clientId: string; name: string | null; points: PhoneGpsRunPoint[] }): Promise<RunSummary> {
  const gpx = buildGpxFromPoints(input.points);
  const file = new File([gpx], `${input.name ?? "live-run"}-${input.clientId}.gpx`, { type: "application/gpx+xml" });
  return importRunFile(file);
}

export function logManualRun(input: {
  name: string | null;
  startedAt: string;
  distanceM: number;
  durationS: number;
  plannedRouteId?: string | null;
  elevationGainM?: number | null;
}): Promise<RunSummary> {
  return api.post("/api/runs", input);
}

/** Runs *do* feed rank now (see server's `services/runRankService.ts`), but deleting one still
 *  doesn't need a client-side recompute trigger, unlike logging one: `runRanks`/`runPrs` are
 *  caches of the *current* best derived from the surviving history, not an append-only ledger
 *  that needs pruning on delete. The next run logged in that category recomputes from whatever
 *  history remains — see runRankStore.ts. */
export function deleteRun(id: string): Promise<void> {
  return api.del(`/api/runs/${id}`);
}
