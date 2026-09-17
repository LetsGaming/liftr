import { ref } from "vue";
import { getServerUrl, setServerUrl } from "../lib/api";

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
 *  real Liftr instance apart from any other server answering on that host/path. */
export async function checkServerIdentity(url: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), VERIFY_TIMEOUT_MS);
  try {
    const res = await fetch(`${url}/api/health`, { signal: controller.signal });
    if (!res.ok) return { ok: false, error: "Server antwortet nicht wie erwartet." };
    const body: unknown = await res.json().catch(() => null);
    const service = body && typeof body === "object" ? (body as { service?: unknown }).service : undefined;
    if (service !== "liftr") return { ok: false, error: "Antwort erhalten, aber das scheint keine Liftr-Instanz zu sein." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Server nicht erreichbar. Adresse und Verbindung prüfen." };
  } finally {
    clearTimeout(timeout);
  }
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
        error.value = "Bitte gib eine gültige Server-Adresse ein.";
        return false;
      }
      const result = await checkServerIdentity(normalized);
      if (!result.ok) {
        error.value = result.error;
        return false;
      }
      setServerUrl(normalized);
      serverUrl.value = normalized;
      return true;
    } finally {
      checking.value = false;
    }
  }

  return { serverUrl, checking, error, verifyAndSave };
}
