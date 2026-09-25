import { ref } from "vue";
import { getServerUrl, getServerVersion, setServerUrl, setServerVersion } from "../lib/api";
import { isNative } from "../lib/platform";
import { t } from "../i18n";
import { resolveCurrentVersion } from "./useAppUpdate";

/** How long a candidate server gets to answer before this gives up and reports "unreachable" —
 *  generous enough for a slow LAN/cold-start container, short enough not to leave the picker
 *  hanging on a genuinely dead address. */
const VERIFY_TIMEOUT_MS = 8000;

/** Adds a scheme (defaults to https://) and strips trailing slashes, so "liftr.example.com",
 *  "liftr.example.com/", and "https://liftr.example.com" all normalize to the same base URL.
 *  Returns null for empty/unparseable input. */
export function normalizeServerUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

/** Hits `${url}/api/health` and checks for the `service: "liftr"` marker (app.ts) — the same
 *  path/shape check Docker healthchecks and CI already rely on, plus the one field that tells a
 *  real Liftr instance apart from any other server answering on that host/path. `version` is
 *  whatever the server reports (app.ts's env.version) — absent for an older server that predates
 *  this field, which is fine, checkVersionMismatch below just skips comparing in that case. */
export async function checkServerIdentity(
  url: string,
): Promise<{ ok: true; version?: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: t("serverConnection.identity.badResponse") };
    const body: unknown = await res.json().catch(() => null);
    const record = body && typeof body === "object" ? (body as { service?: unknown; version?: unknown }) : undefined;
    if (record?.service !== "liftr") return { ok: false, error: t("serverConnection.identity.notLiftr") };
    return { ok: true, version: typeof record.version === "string" ? record.version : undefined };
  } catch (err) {
    console.warn("server identity check failed", err);
    return { ok: false, error: t("serverConnection.identity.unreachable") };
  } finally {
    clearTimeout(timeout);
  }
}

// Module-level (not per-call refs — same shared-state pattern as useAppUpdate.ts) so App.vue's
// launch-time check and ProfilePage.vue's connection section agree on one result instead of each
// firing its own request.
const serverVersion = ref<string | null>(getServerVersion());
const versionMismatch = ref(false);

/**
 * Compares the saved server's version (via checkServerIdentity) against this app's own version
 * (useAppUpdate.ts's resolveCurrentVersion — the one place that knows APK versionName vs
 * __APP_VERSION__, reused rather than reimplemented here). Native-only: a web/PWA build is
 * same-origin with its server and deploys together, so they can't mismatch. Skipped until a
 * server URL is actually saved (first-run setup already runs checkServerIdentity itself via
 * verifyAndSave). Non-blocking — it only ever sets `versionMismatch`, never throws or prevents
 * app usage. No internal "already ran" guard, same as useAppUpdate.ts's check(): App.vue's own
 * onMounted (which only ever runs once per real app boot) is what makes this "once per boot" in
 * practice, and ProfilePage.vue calling it again on its own mount is a deliberate re-check (same
 * pattern as its "Nach Updates suchen" re-check), not a bug.
 */
export async function checkVersionMismatch(): Promise<boolean> {
  if (!isNative()) return false;
  const url = getServerUrl();
  if (!url) return false;
  const result = await checkServerIdentity(url);
  if (!result.ok || !result.version) return false;
  serverVersion.value = result.version;
  setServerVersion(result.version);
  try {
    const clientVersion = await resolveCurrentVersion();
    versionMismatch.value = clientVersion !== result.version;
  } catch (err) {
    // App.getInfo() (resolveCurrentVersion) can reject on-device (plugin misconfiguration, OS
    // quirk) — same fail-silent contract as checkServerIdentity's own network-error catch above:
    // this whole feature is warn-only, so a resolution failure just means no mismatch is flagged,
    // never an unhandled rejection reaching App.vue's/ProfilePage.vue's un-caught `.then()`.
    console.warn("client version resolution failed", err);
    return false;
  }
  return versionMismatch.value;
}

export function useServerVersionInfo() {
  return { serverVersion, versionMismatch };
}

/**
 * Native-only server connection state: the currently-saved URL (if any), and a
 * verify-then-persist flow for the first-launch picker (ServerGate.vue) and the
 * later "change server" action (ProfilePage.vue) to share, so both go through the exact same
 * normalize → check-identity → save steps.
 */
export function useServerConnection() {
  const serverUrl = ref(getServerUrl());
  const checking = ref(false);
  const error = ref<string | null>(null);

  async function verifyAndSave(input: string): Promise<boolean> {
    checking.value = true;
    error.value = null;
    try {
      const normalized = normalizeServerUrl(input);
      if (!normalized) {
        error.value = t("serverConnection.invalidAddress");
        return false;
      }
      const result = await checkServerIdentity(normalized);
      if (!result.ok) {
        error.value = result.error;
        return false;
      }
      setServerUrl(normalized);
      serverUrl.value = normalized;
      if (result.version) {
        setServerVersion(result.version);
        serverVersion.value = result.version;
      }
      return true;
    } finally {
      checking.value = false;
    }
  }

  return { serverUrl, checking, error, verifyAndSave };
}
