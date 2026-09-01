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
}

/** POSTs one batch to /api/sync — chunking (BUG-01) happens in syncStore.ts's `flush()`, which
 *  is the only caller; this stays a thin one-call wrapper around the endpoint. */
export async function postSyncBatch(items: SyncItem[]): Promise<SyncResult[]> {
  const { results } = await api.post<{ results: SyncResult[] }>("/api/sync", { items });
  return results;
}
