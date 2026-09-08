import { and, eq, gt, isNull } from "drizzle-orm";
import { inviteCodes, sessions, users, type LiftrDb } from "@liftr/db";

export type UserRow = typeof users.$inferSelect;

export function findUserByUsername(db: LiftrDb, username: string) {
  return db.query.users.findFirst({ where: eq(users.username, username) });
}

export function findUserById(db: LiftrDb, id: string) {
  return db.query.users.findFirst({ where: eq(users.id, id) });
}

export function findOwnerUser(db: LiftrDb) {
  return db.query.users.findFirst({ where: eq(users.role, "owner") });
}

export async function setUserPassword(db: LiftrDb, userId: string, passwordHash: string): Promise<void> {
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function insertUser(
  db: LiftrDb,
  values: { username: string; name: string; role: "owner" | "member"; passwordHash: string },
): Promise<UserRow> {
  const [row] = await db.insert(users).values(values).returning();
  if (!row) throw new Error("user insert failed");
  return row;
}

export function listUsers(db: LiftrDb) {
  return db.query.users.findMany();
}

export async function deleteUser(db: LiftrDb, userId: string): Promise<void> {
  await db.delete(users).where(eq(users.id, userId));
}

export async function createSession(db: LiftrDb, userId: string, tokenHash: string): Promise<void> {
  await db.insert(sessions).values({ userId, tokenHash });
}

/** Joined to the owning user's role, since every call site needs both the identity and the role
 *  to authorize a request — a single lookup instead of two round-trips per request. */
export async function findSessionByTokenHash(
  db: LiftrDb,
  tokenHash: string,
): Promise<{ userId: string; role: "owner" | "member" } | undefined> {
  const row = await db.query.sessions.findFirst({
    where: eq(sessions.tokenHash, tokenHash),
    with: { user: { columns: { role: true } } },
  });
  return row ? { userId: row.userId, role: row.user.role } : undefined;
}

export async function touchSession(db: LiftrDb, tokenHash: string): Promise<void> {
  await db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSessionByTokenHash(db: LiftrDb, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function createInviteCode(
  db: LiftrDb,
  values: { code: string; createdByUserId: string; expiresAt: Date },
): Promise<void> {
  await db.insert(inviteCodes).values(values);
}

export function findValidInviteCode(db: LiftrDb, code: string) {
  return db.query.inviteCodes.findFirst({
    where: and(eq(inviteCodes.code, code), gt(inviteCodes.expiresAt, new Date()), isNull(inviteCodes.usedByUserId)),
  });
}

export async function redeemInviteCode(db: LiftrDb, id: string, usedByUserId: string): Promise<void> {
  await db.update(inviteCodes).set({ usedByUserId }).where(eq(inviteCodes.id, id));
}
