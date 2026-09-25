/**
 * Maps a server error code (ApiError.code — the body's `error` field, see lib/api.ts and
 * app.ts's error handler) to a translated message. Most server 400s carry a `detail` that's
 * already a human sentence and gets shown as-is; a growing minority (Health Connect's
 * "no_route_or_distance", the shared password-strength check's "password_too_common") carry a
 * machine-readable code instead, precisely so the client can translate it rather than display
 * whatever language the server happened to write it in.
 */
import { t } from "../i18n";

const ERROR_CODE_KEYS: Record<string, string> = {
  no_route_or_distance: "healthConnect.noRouteOrDistance",
  password_too_common: "profile.errors.passwordTooWeak",
};

/** `fallback` is shown for any code with no dedicated translation (e.g. `detail` text the server
 *  already sends translated-enough, or a raw error message) — falling back to a generic message
 *  only when there's nothing else to show. */
export function serverErrorMessage(code: string | undefined, fallback?: string): string {
  const key = code ? ERROR_CODE_KEYS[code] : undefined;
  if (key) return t(key);
  return fallback ?? t("serverErrors.generic");
}
