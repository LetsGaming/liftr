/**
 * A small `localStorage` ring buffer of past Health Connect sync reports — the client-side
 * counterpart to the server's error log (`services/authService.ts`'s `getRecentErrors`). Must be
 * client-side: a skipped workout (no route granted, below the app's usable-data bar, ...) never
 * reaches the server at all, so there is no server-side log entry for it to read back. Read by
 * DiagnosticsPage.vue's "Synchronisierung" section.
 *
 * Every read/write is wrapped in try/catch — `localStorage` can throw (private browsing, blocked
 * site data, quota) and this log is a diagnostic nicety, never something a sync should fail over.
 */
import type { HealthConnectImportResult } from "../health/healthConnect";

const SYNC_LOG_KEY = "liftr.healthconnect.syncLog";
/** Ring buffer size — enough sync history to spot a pattern (e.g. "every walk from this watch
 *  gets skipped") without the log growing unbounded across months of daily resumes. */
const MAX_ENTRIES = 20;
/** Per-entry cap on the stored `workouts` array — a 90-day rescan can return far more workouts
 *  than the summary counts need kept in full, and each row embeds the whole raw report. Summary
 *  counts (imported/skipped/failed) are never truncated, only the per-workout detail. */
const MAX_WORKOUTS_PER_ENTRY = 50;

export type SyncTrigger = "manual" | "resume";

export interface SyncLogEntry {
  at: string; // ISO — when this sync ran
  trigger: SyncTrigger;
  windowStart: string; // ISO — the Health Connect query window scanned
  windowEnd: string;
  result: HealthConnectImportResult;
}

function readRaw(): SyncLogEntry[] {
  try {
    const raw = localStorage.getItem(SYNC_LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SyncLogEntry[]) : [];
  } catch {
    return [];
  }
}

/** Every past sync report, most recent first. */
export function readSyncLog(): SyncLogEntry[] {
  return readRaw();
}

/** Appends one sync report to the ring buffer, evicting the oldest entry past `MAX_ENTRIES`.
 *  Called from `importNewHealthConnectWorkouts` after every check — manual button tap or an
 *  automatic app-resume check alike, so nothing that happened is ever missing from the log even
 *  though only some of those runs also surface a toast (see syncStore.ts). */
export function recordSyncReport(
  trigger: SyncTrigger,
  windowStart: string,
  windowEnd: string,
  result: HealthConnectImportResult,
): void {
  try {
    const workouts =
      result.workouts.length > MAX_WORKOUTS_PER_ENTRY ? result.workouts.slice(0, MAX_WORKOUTS_PER_ENTRY) : result.workouts;
    const entry: SyncLogEntry = {
      at: new Date().toISOString(),
      trigger,
      windowStart,
      windowEnd,
      result: { ...result, workouts },
    };
    const next = [entry, ...readRaw()].slice(0, MAX_ENTRIES);
    localStorage.setItem(SYNC_LOG_KEY, JSON.stringify(next));
  } catch (err) {
    // the sync itself already succeeded or failed independently of this — but a silently
    // swallowed quota failure here would leave no trace anywhere that the log stopped updating
    console.warn("Failed to persist Health Connect sync log entry", err);
  }
}

export function clearSyncLog(): void {
  try {
    localStorage.removeItem(SYNC_LOG_KEY);
  } catch {
    // nothing to do if storage is unavailable
  }
}
