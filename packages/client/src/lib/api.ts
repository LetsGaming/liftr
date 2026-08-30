/**
 * Thin fetch wrapper. The bearer token (plan 1.1's single-token auth) lives in localStorage,
 * entered once via AuthGate.vue on the first 401 the app sees.
 *
 * `apiBase()` matters once the client runs inside a Capacitor WebView (Phase 5 migration):
 * there's no dev-server proxy on-device, so every request needs an absolute LAN server URL.
 * Empty string in the browser/dev-server case, so the existing Vite proxy keeps working
 * completely unchanged there — this only does something different on a native build.
 */
const TOKEN_KEY = "liftr.token";

export function apiBase(): string {
  return import.meta.env.VITE_API_BASE ?? "";
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
    throw new ApiError(`${init?.method ?? "GET"} ${path} failed: ${res.status}`, res.status);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: "PUT", body: JSON.stringify(body) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: "DELETE" }),
};
