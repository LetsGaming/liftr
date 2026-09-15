import { elevationGainFrom, type CorridorRing } from "@liftr/shared";
import { z } from "zod";
import { env } from "../env.js";

export class OrsUnavailableError extends Error {
  constructor(
    public status: number | "network" | "timeout" | "parse",
    message: string,
  ) {
    super(message);
    this.name = "OrsUnavailableError";
  }
}

const orsResponseSchema = z.object({
  features: z
    .array(
      z.object({
        geometry: z.object({
          coordinates: z.array(z.array(z.number()).min(2).max(3)),
        }),
        properties: z.object({
          summary: z.object({ distance: z.number() }),
          ascent: z.number().optional(),
        }),
      }),
    )
    .min(1),
});

export interface OrsCoordinate {
  lat: number;
  lon: number;
  ele?: number;
}

export interface OrsRouteResult {
  coordinates: OrsCoordinate[];
  distanceM: number;
  elevationGainM: number | null;
}

/**
 * Calls OpenRouteService's directions API for a road/trail-snapped route + per-point elevation.
 * ORS's own coordinate order is [lon, lat] — the opposite of every other lat/lon pair in this
 * codebase, which is always {lat, lon}. This swap happens ONLY here, in both directions (request
 * and response), so it can never leak into the rest of the app as a silent bug. `avoidPolygons`
 * shares the same swap — see plannedRouteService.ts's `buildAvoidCorridor` usage for how a closed
 * loop's closing leg uses this to route around its own outbound corridor instead of retracing it.
 */
export async function fetchOrsRoute(
  waypoints: { lat: number; lon: number }[],
  opts?: { avoidPolygons?: CorridorRing[] | null },
): Promise<OrsRouteResult> {
  // Safe today — every caller (computeGeometry) already guards on env.orsApiKey being present
  // before calling this — but this function is exported, so a direct call without that guard
  // would otherwise silently send `Authorization: undefined` instead of failing loudly.
  if (!env.orsApiKey) {
    throw new OrsUnavailableError("network", "ORS API key is not configured");
  }
  const url = `${env.orsBaseUrl}/v2/directions/${env.orsProfile}/geojson`;
  const rings = opts?.avoidPolygons;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: env.orsApiKey },
      body: JSON.stringify({
        coordinates: waypoints.map((w) => [w.lon, w.lat]), // [lon, lat] — see module doc above
        elevation: true,
        instructions: false,
        units: "m",
        // Omitted entirely (not just an empty array) when there's no avoidance, so a plain
        // (non-loop) request's body is byte-for-byte identical to before this option existed.
        ...(rings && rings.length > 0
          ? {
              options: {
                avoid_polygons: {
                  type: "MultiPolygon",
                  // One polygon per ring, single outer ring, no holes — [lon, lat] again, same
                  // swap as `coordinates` above.
                  coordinates: rings.map((ring) => [ring.map((p) => [p.lon, p.lat])]),
                },
              },
            }
          : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new OrsUnavailableError(timedOut ? "timeout" : "network", (err as Error).message);
  }

  if (!res.ok) {
    throw new OrsUnavailableError(res.status, `ORS responded ${res.status}`);
  }

  let json: unknown;
  try {
    json = await res.json();
  } catch (err) {
    throw new OrsUnavailableError("parse", (err as Error).message);
  }

  const parsed = orsResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new OrsUnavailableError("parse", parsed.error.message);
  }

  const feature = parsed.data.features[0]!;
  const coordinates: OrsCoordinate[] = feature.geometry.coordinates.map((c) => ({
    lon: c[0]!,
    lat: c[1]!,
    ele: c[2],
  }));
  const distanceM = feature.properties.summary.distance;
  const elevationGainM =
    feature.properties.ascent ?? elevationGainFrom(coordinates.map((c) => ({ ele: c.ele ?? null })));

  return { coordinates, distanceM, elevationGainM };
}
