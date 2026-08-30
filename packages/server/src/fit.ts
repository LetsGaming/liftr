/**
 * FIT parser (plan Phase 4.1). Uses the official `@garmin/fitsdk` rather than hand-rolling a
 * binary decoder — FIT's definition-message/base-type/developer-field machinery is real
 * complexity that an official, actively-maintained SDK already gets right. Extracts the full
 * per-record trackpoint array, same as gpx.ts, for the same reason: replay needs every point,
 * not just the file's own summary (audit §5).
 */
import { Decoder, Stream } from "@garmin/fitsdk";
import type { RunPoint } from "@liftr/shared";

const SEMICIRCLE_TO_DEG = 180 / 2 ** 31;

interface FitRecordMesg {
  timestamp?: string;
  positionLat?: number;
  positionLong?: number;
  altitude?: number;
  enhancedAltitude?: number;
  heartRate?: number;
  cadence?: number;
}

export function parseFit(buffer: Buffer): RunPoint[] {
  const decoder = new Decoder(Stream.fromBuffer(buffer));
  if (!decoder.isFIT()) throw new Error("not a valid FIT file");
  if (!decoder.checkIntegrity()) throw new Error("FIT file failed CRC integrity check");

  const { messages, errors } = decoder.read();
  if (errors.length > 0) throw new Error(`FIT decode error: ${errors[0]}`);

  const records = (messages.recordMesgs ?? []) as FitRecordMesg[];
  const points: RunPoint[] = [];

  for (const r of records) {
    // Records before GPS lock (or on an indoor trainer) carry no position — same "skip
    // incomplete points" rule gpx.ts applies to trackpoints missing lat/lon.
    if (r.positionLat == null || r.positionLong == null || !r.timestamp) continue;
    const t = new Date(r.timestamp).getTime();
    if (!Number.isFinite(t)) continue;

    points.push({
      t,
      lat: r.positionLat * SEMICIRCLE_TO_DEG,
      lon: r.positionLong * SEMICIRCLE_TO_DEG,
      ele: r.enhancedAltitude ?? r.altitude,
      hr: r.heartRate,
      cadence: r.cadence,
    });
  }

  if (points.length === 0) throw new Error("no GPS-tagged records found in FIT file");
  return points.sort((a, b) => a.t - b.t);
}
