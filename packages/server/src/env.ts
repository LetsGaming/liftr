/** Minimal env config. Auth stays deliberately simple — present, not elaborate. */
export const env = {
  port: Number(process.env.PORT ?? 3001),
  dbPath: process.env.LIFTR_DB_PATH ?? "../../data/liftr.db",
  /** Single bearer token, checked on every request. No accounts, no sessions. */
  token: process.env.LIFTR_TOKEN,
  imagesDir: process.env.LIFTR_IMAGES_DIR ?? "../../data/images",
  clientDistDir: process.env.LIFTR_CLIENT_DIST ?? "../../packages/client/dist",
  /** Comma-separated allow-list, e.g. "https://liftr.example.com,capacitor://localhost". Unset
   *  (the default, same posture as an unset LIFTR_TOKEN in dev) keeps CORS reflecting any origin
   *  — low-risk today since auth is a bearer token in a header, not a cookie, so a malicious page
   *  gaining "permission" to call the API still can't read the token out of another origin's
   *  localStorage. Set this once the server is reachable beyond the reverse proxy's own trusted
   *  network to lock CORS down to known origins for real. */
  allowedOrigins: process.env.LIFTR_ALLOWED_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
  /** OpenRouteService: BYO API key for planned-route road-snapping + elevation. Unset is a fully
   *  supported degraded state (straight-line distance, no elevation) — no production-throw like
   *  LIFTR_TOKEN has, since self-hosting without this key is a legitimate, deliberate choice. */
  orsApiKey: process.env.LIFTR_ORS_API_KEY,
  orsBaseUrl: process.env.LIFTR_ORS_BASE_URL ?? "https://api.openrouteservice.org",
  orsProfile: process.env.LIFTR_ORS_PROFILE ?? "foot-walking",
};

if (!env.token && process.env.NODE_ENV === "production") {
  throw new Error("LIFTR_TOKEN must be set in production — the homelab reverse proxy is not a substitute.");
}
