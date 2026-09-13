/**
 * Every external fetch in this package shares this: a default 10s timeout via
 * `AbortSignal.timeout()` so a hung upstream (wger, GitHub raw, free-exercise-db) can't stall an
 * entire ingest run indefinitely, plus one `fetchJson` used to live hand-copied in wgerSource.ts
 * and matchWgerIds.ts (and near-duplicated inline in ingestImages.ts) — consolidated here.
 */
export async function fetchWithTimeout(url: string, opts: RequestInit = {}, timeoutMs = 10_000): Promise<Response> {
  return fetch(url, { ...opts, signal: AbortSignal.timeout(timeoutMs) });
}

export async function fetchJson<T>(url: string, timeoutMs = 10_000): Promise<T> {
  const res = await fetchWithTimeout(url, {}, timeoutMs);
  if (!res.ok) throw new Error(`fetch failed: ${res.status} ${res.statusText} (${url})`);
  return res.json() as Promise<T>;
}
