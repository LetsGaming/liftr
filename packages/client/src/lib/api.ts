/**
 * Thin fetch wrapper. The bearer token lives in localStorage, entered once via AuthGate.vue on
 * the first 401 the app sees.
 *
 * `apiBase()` matters once the client runs inside a Capacitor WebView: there's no dev-server
 * proxy and no same-origin server to fall back to on-device, so every request needs an absolute
 * server URL. On native, that's whatever the user entered and verified via ServerGate.vue
 * (composables/useServerConnection.ts) — never baked in at build time, so moving/rebuilding the
 * backend never requires a new APK. On web, this stays "" (same-origin; the existing Vite dev
 * proxy or the server's own single-origin static serving handles the rest).
 */
import { isNative } from "./platform";

const TOKEN_KEY = "liftr.token";
const SERVER_URL_KEY = "liftr.serverUrl";

export function apiBase(): string {
  return isNative() ? getServerUrl() : "";
}

export function getServerUrl(): string {
  return localStorage.getItem(SERVER_URL_KEY) ?? "";
}

export function setServerUrl(url: string) {
  localStorage.setItem(SERVER_URL_KEY, url);
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) ?? "";
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    // Server error bodies are `{ error: string, detail?: string }` (see app.ts's error handler) —
    // carried here so callers (e.g. AuthGate.vue) can distinguish *why* a 400 happened instead of
    // showing one generic message for every 400 cause.
    public detail?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(apiBase() + path, {
    ...init,
    headers: {
      // Only set Content-Type when there's actually a body — Fastify's default JSON body
      // parser rejects an empty body sent with this header (400), which silently broke
      // every bodyless DELETE (e.g. routine deletion) until caught by an actual click test.
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    let detail: string | undefined;
    try {
      const body: unknown = await res.clone().json();
      if (body && typeof body === "object" && typeof (body as { detail?: unknown }).detail === "string") {
        detail = (body as { detail: string }).detail;
      }
    } catch {
      // Non-JSON or empty error body (e.g. a 429 with no body) — no detail available.
    }
    throw new ApiError(`${init?.method ?? "GET"} ${path} failed: ${res.status}`, res.status, detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown, init?: RequestInit) =>
    request<T>(path, { ...init, method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
