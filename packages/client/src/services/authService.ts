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
