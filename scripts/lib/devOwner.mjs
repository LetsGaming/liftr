/** Shared by scripts/dev-up.mjs (auto-login) and scripts/seed-mock-data.ts (owner password seed) —
 *  one source of truth so the two can never drift apart. Not a secret: every dev-up.mjs session's
 *  DB is disposable and local-only. The password clears the setup screen's common-password check
 *  (see routes/auth.ts's passwordSchema). */
export const DEV_OWNER_USERNAME = "owner";
export const DEV_OWNER_PASSWORD = "liftr-dev-session";
