/**
 * GPX parser (plan Phase 4.1). Extracts the full per-point trackpoint array — never just a
 * summary — because that array is what makes run replay possible later (audit §5). Handles
 * the Garmin TrackPointExtension namespace for heart rate/cadence when present; both are
 * optional per the GPX spec, so most watches/apps will have some but not all fields.
 */
import { XMLParser } from "fast-xml-parser";
import type { RunPoint } from "@liftr/shared";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

/** Digs through the `extensions` block for gpxtpx:hr / gpxtpx:cad, ignoring the namespace prefix. */
function findExtension(ext: unknown, key: "hr" | "cad"): number | undefined {
  if (!ext || typeof ext !== "object") return undefined;
  for (const [k, v] of Object.entries(ext as Record<string, unknown>)) {
    const shortKey = k.split(":").pop();
    if (shortKey === key && (typeof v === "number" || typeof v === "string")) {
      return Number(v);
    }
    if (typeof v === "object") {
      const nested = findExtension(v, key);
      if (nested != null) return nested;
    }
  }
  return undefined;
}

export function parseGpx(xml: string): RunPoint[] {
  const doc = parser.parse(xml);
  const gpx = doc.gpx;
  if (!gpx) throw new Error("not a valid GPX file (missing <gpx> root)");

  const tracks = asArray(gpx.trk);
  const points: RunPoint[] = [];

  for (const trk of tracks) {
    for (const seg of asArray(trk.trkseg)) {
      for (const pt of asArray(seg.trkpt)) {
        const lat = Number(pt["@_lat"]);
        const lon = Number(pt["@_lon"]);
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
        const timeStr = pt.time;
        const t = timeStr ? new Date(timeStr).getTime() : NaN;
        if (!Number.isFinite(t)) continue;

        const ele = pt.ele != null ? Number(pt.ele) : undefined;
        const hr = findExtension(pt.extensions, "hr");
        const cadence = findExtension(pt.extensions, "cad");

        points.push({ t, lat, lon, ele, hr, cadence });
      }
    }
  }

  if (points.length === 0) throw new Error("no trackpoints found in GPX file");
  return points.sort((a, b) => a.t - b.t);
}
