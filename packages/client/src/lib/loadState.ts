/**
 * Every read-only store's `load()` follows the same shape: fetch, assign the result onto state,
 * flip `loaded` true — and on failure, flip an `error` flag instead so a stalled-load banner
 * (OverviewPage and friends) can tell "still fetching" apart from "failed" instead of `loaded`
 * just staying false forever either way. This was copy-pasted store to store (with comments
 * literally pointing back at xpStore.ts's copy) — pulled out once here.
 *
 * Callers wire it to their own field names via small setter closures rather than this taking a
 * `this`/state object directly, since a few stores (runRankStore's three sections, settingsStore's
 * three independent fetches) don't use the plain `loaded`/`error` names.
 */
export async function withLoadState<T>(
  fetch: () => Promise<T>,
  handlers: {
    /** Assign the resolved value onto the store's own state fields. */
    apply: (result: T) => void;
    setLoaded: (loaded: boolean) => void;
    /** Omit for stores with no `error` flag (e.g. rankEventsStore, runsStore) — a failed fetch
     *  then just leaves `loaded` false, no further signal. */
    setError?: (error: boolean) => void;
    /** Set when a store's contract is "loaded means attempted, not succeeded" (plannedRouteStore),
     *  so a failed first load doesn't refetch on every subsequent visit. */
    loadedOnError?: boolean;
  },
): Promise<void> {
  try {
    const result = await fetch();
    handlers.apply(result);
    handlers.setLoaded(true);
    handlers.setError?.(false);
  } catch {
    handlers.setError?.(true);
    if (handlers.loadedOnError) handlers.setLoaded(true);
  }
}
