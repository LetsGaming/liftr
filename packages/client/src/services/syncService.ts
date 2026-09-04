import { api } from "../lib/api";

export interface SyncItem {
  clientId: string;
  type: "start_workout" | "log_set" | "finish_workout" | "add_exercise";
  payload: unknown;
}

export interface SyncResult {
  clientId: string;
  status: "created" | "already_synced" | "error";
  serverId?: string;
  error?: string;
  ranks?: {
    exerciseId: string;
    rankedUp: boolean;
    newPr: { kind: string; value: number } | null;
    tier: string;
    division: number;
    lp: number;
    prevLp: number;
    plausibilityReason: "pace" | "improbable_jump" | "exceeds_ceiling" | null;
  }[];
  /** Set only on finish_workout results — the streak/XP mechanics redesign
   *  (docs/superpowers/specs/2026-09-04-streak-xp-mechanics-design.md, §2/§3): the two
   *  session-level XP bonuses frozen onto this workout's row, plus which muscles actually earned
   *  the variety bonus so the client's Finish Sequence can name them instead of showing a bare
   *  count. Mirrors server's SyncResult (packages/server/src/services/syncService.ts). */
  consistencyBonusXp?: number;
  varietyBonusXp?: number;
  newMuscleSlugs?: string[];
}

/** POSTs one batch to /api/sync — chunking (BUG-01) happens in syncStore.ts's `flush()`, which
 *  is the only caller; this stays a thin one-call wrapper around the endpoint. */
export async function postSyncBatch(items: SyncItem[]): Promise<SyncResult[]> {
  const { results } = await api.post<{ results: SyncResult[] }>("/api/sync", { items });
  return results;
}
