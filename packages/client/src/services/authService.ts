import { api, setToken } from "../lib/api";

export interface Me {
  id: string;
  username: string;
  name: string;
  role: "owner" | "member";
}

export interface Member {
  id: string;
  username: string;
  name: string;
  role: "owner" | "member";
  createdAt: string;
}

export function getMe(): Promise<Me> {
  return api.get<Me>("/api/auth/me");
}

export async function logout(): Promise<void> {
  await api.post("/api/auth/logout", {});
  setToken("");
}

export function createInvite(): Promise<{ code: string; expiresAt: string }> {
  return api.post("/api/members/invite", {});
}

export function listMembers(): Promise<Member[]> {
  return api.get<Member[]>("/api/members");
}

export function removeMember(id: string): Promise<void> {
  return api.del(`/api/members/${id}`);
}

export interface ErrorLogEntry {
  id: string;
  occurredAt: string;
  method: string;
  url: string;
  statusCode: number;
  message: string;
  stack: string | null;
}

/** Owner-only — see routes/diagnostics.ts. Powers ProfilePage's Diagnostics panel: the last N
 *  unexpected-error occurrences, visible from inside the app, no server/log access needed. */
export function getRecentErrors(): Promise<ErrorLogEntry[]> {
  return api.get<ErrorLogEntry[]>("/api/diagnostics/errors");
}

export async function deleteMyAccount(): Promise<void> {
  await api.del("/api/auth/me");
  setToken("");
}

export function changeDisplayName(name: string): Promise<Me> {
  return api.patch<Me>("/api/auth/me/name", { name });
}

export function changeUsername(currentPassword: string, username: string): Promise<Me> {
  return api.patch<Me>("/api/auth/me/username", { currentPassword, username });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.patch("/api/auth/me/password", { currentPassword, newPassword });
}

export interface Session {
  id: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  /** `null` when the session's stored User-Agent is missing or unrecognized — see
   *  server/lib/deviceLabel.ts. The client composes and translates the display string itself
   *  (see ProfilePage.vue's deviceLabel()) rather than receiving a finished sentence. */
  device: { os: string | null; browser: string | null } | null;
  current: boolean;
}

export function listSessions(): Promise<Session[]> {
  return api.get<Session[]>("/api/auth/sessions");
}

export async function revokeSession(id: string): Promise<void> {
  await api.del(`/api/auth/sessions/${id}`);
}

export async function revokeOtherSessions(): Promise<void> {
  await api.del("/api/auth/sessions");
}
