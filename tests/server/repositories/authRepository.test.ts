import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import {
  createInviteCode,
  createSession,
  deleteOtherSessionsForUser,
  deleteSessionById,
  deleteSessionByTokenHash,
  deleteUser,
  findOwnerUser,
  findSessionByTokenHash,
  findUserByUsername,
  findUserById,
  findValidInviteCode,
  insertUser,
  listSessionsForUser,
  listUsers,
  redeemInviteCode,
  setDisplayName,
  setUserPassword,
  setUsername,
  touchSession,
} from "~server/repositories/authRepository.js";

let db: LiftrDb;

beforeEach(() => {
  db = createTestDb();
});

describe("findOwnerUser", () => {
  it("returns the seeded owner", async () => {
    const owner = await findOwnerUser(db);
    expect(owner?.id).toBe(OWNER_USER_ID);
    expect(owner?.role).toBe("owner");
  });
});

describe("findUserByUsername / findUserById", () => {
  it("returns undefined for an unknown username", async () => {
    expect(await findUserByUsername(db, "nobody")).toBeUndefined();
  });

  it("finds a user by username after insertion", async () => {
    const created = await insertUser(db, { username: "alice", name: "Alice", role: "member", passwordHash: "x:y" });
    const found = await findUserByUsername(db, "alice");
    expect(found?.id).toBe(created.id);
    expect(await findUserById(db, created.id)).toMatchObject({ username: "alice" });
  });
});

describe("setUserPassword", () => {
  it("updates the passwordHash for an existing user", async () => {
    await setUserPassword(db, OWNER_USER_ID, "newsalt:newhash");
    const owner = await findUserById(db, OWNER_USER_ID);
    expect(owner?.passwordHash).toBe("newsalt:newhash");
  });
});

describe("listUsers / deleteUser", () => {
  it("lists every user, including the seeded owner", async () => {
    await insertUser(db, { username: "bob", name: "Bob", role: "member", passwordHash: "x:y" });
    const all = await listUsers(db);
    expect(all.map((u) => u.username).sort()).toEqual(["bob", "owner"]);
  });

  it("removes a user", async () => {
    const created = await insertUser(db, { username: "carol", name: "Carol", role: "member", passwordHash: "x:y" });
    await deleteUser(db, created.id);
    expect(await findUserById(db, created.id)).toBeUndefined();
  });
});

describe("sessions", () => {
  it("finds a session by token hash, joined to its user's role", async () => {
    await createSession(db, OWNER_USER_ID, "hash-1");
    const found = await findSessionByTokenHash(db, "hash-1");
    expect(found).toMatchObject({ userId: OWNER_USER_ID, role: "owner" });
    expect(found?.absoluteExpiresAt).toBeInstanceOf(Date);
  });

  it("returns undefined for an unknown token hash", async () => {
    expect(await findSessionByTokenHash(db, "does-not-exist")).toBeUndefined();
  });

  it("touchSession does not throw for an existing session, and clamps to the absolute ceiling", async () => {
    await createSession(db, OWNER_USER_ID, "hash-2");
    const before = await findSessionByTokenHash(db, "hash-2");
    await expect(touchSession(db, "hash-2", before!.absoluteExpiresAt)).resolves.not.toThrow();
    const after = await findSessionByTokenHash(db, "hash-2");
    expect(after!.expiresAt.getTime()).toBeLessThanOrEqual(before!.absoluteExpiresAt.getTime());
  });

  it("touchSession never slides expiresAt past a near absolute ceiling", async () => {
    await createSession(db, OWNER_USER_ID, "hash-2b");
    const nearCeiling = new Date(Date.now() + 1000);
    await touchSession(db, "hash-2b", nearCeiling);
    const after = await findSessionByTokenHash(db, "hash-2b");
    expect(after!.expiresAt.getTime()).toBe(nearCeiling.getTime());
  });

  it("deleteSessionByTokenHash removes the session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-3");
    await deleteSessionByTokenHash(db, "hash-3");
    expect(await findSessionByTokenHash(db, "hash-3")).toBeUndefined();
  });

  it("listSessionsForUser returns only that user's sessions, newest-used first", async () => {
    const other = await insertUser(db, { username: "greta", name: "Greta", role: "member", passwordHash: "x:y" });
    await createSession(db, OWNER_USER_ID, "hash-4a");
    await createSession(db, other.id, "hash-4b");
    const rows = await listSessionsForUser(db, OWNER_USER_ID);
    expect(rows.map((r) => r.tokenHash)).toEqual(["hash-4a"]);
  });

  it("deleteSessionById refuses to delete another user's session (IDOR)", async () => {
    const other = await insertUser(db, { username: "harry", name: "Harry", role: "member", passwordHash: "x:y" });
    await createSession(db, other.id, "hash-5");
    const [victimSession] = await listSessionsForUser(db, other.id);
    const deleted = await deleteSessionById(db, OWNER_USER_ID, victimSession!.id);
    expect(deleted).toBe(false);
    expect(await findSessionByTokenHash(db, "hash-5")).toBeDefined();
  });

  it("deleteSessionById deletes the caller's own session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-6");
    const [own] = await listSessionsForUser(db, OWNER_USER_ID);
    expect(await deleteSessionById(db, OWNER_USER_ID, own!.id)).toBe(true);
    expect(await findSessionByTokenHash(db, "hash-6")).toBeUndefined();
  });

  it("deleteOtherSessionsForUser keeps the given token and removes every other session for that user", async () => {
    await createSession(db, OWNER_USER_ID, "hash-7a");
    await createSession(db, OWNER_USER_ID, "hash-7b");
    await deleteOtherSessionsForUser(db, OWNER_USER_ID, "hash-7a");
    expect(await findSessionByTokenHash(db, "hash-7a")).toBeDefined();
    expect(await findSessionByTokenHash(db, "hash-7b")).toBeUndefined();
  });

  it("deleteOtherSessionsForUser with no token to keep removes every session for that user", async () => {
    await createSession(db, OWNER_USER_ID, "hash-8a");
    await createSession(db, OWNER_USER_ID, "hash-8b");
    await deleteOtherSessionsForUser(db, OWNER_USER_ID);
    expect(await listSessionsForUser(db, OWNER_USER_ID)).toHaveLength(0);
  });
});

describe("setUsername / setDisplayName", () => {
  it("updates the username", async () => {
    await setUsername(db, OWNER_USER_ID, "newowner");
    expect(await findUserByUsername(db, "newowner")).toMatchObject({ id: OWNER_USER_ID });
  });

  it("updates the display name", async () => {
    await setDisplayName(db, OWNER_USER_ID, "New Name");
    expect(await findUserById(db, OWNER_USER_ID)).toMatchObject({ name: "New Name" });
  });
});

describe("invite codes", () => {
  it("finds a valid (unexpired, unused) invite code", async () => {
    await createInviteCode(db, { code: "ABCD2345", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000) });
    const found = await findValidInviteCode(db, "ABCD2345");
    expect(found).toBeDefined();
  });

  it("does not return an expired code", async () => {
    await createInviteCode(db, { code: "EXPIRED1", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() - 1000) });
    expect(await findValidInviteCode(db, "EXPIRED1")).toBeUndefined();
  });

  it("does not return an already-redeemed code", async () => {
    await createInviteCode(db, { code: "USEDCODE", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000) });
    const found = await findValidInviteCode(db, "USEDCODE");
    const member = await insertUser(db, { username: "dave", name: "Dave", role: "member", passwordHash: "x:y" });
    await redeemInviteCode(db, found!.id, member.id);
    expect(await findValidInviteCode(db, "USEDCODE")).toBeUndefined();
  });

  it("redeemInviteCode returns true for the first caller and false for a second, concurrent-style call on the same id — only the first usedByUserId sticks", async () => {
    await createInviteCode(db, { code: "RACECODE", createdByUserId: OWNER_USER_ID, expiresAt: new Date(Date.now() + 86_400_000) });
    const found = await findValidInviteCode(db, "RACECODE");
    const first = await insertUser(db, { username: "erin", name: "Erin", role: "member", passwordHash: "x:y" });
    const second = await insertUser(db, { username: "frank", name: "Frank", role: "member", passwordHash: "x:y" });

    const firstResult = await redeemInviteCode(db, found!.id, first.id);
    const secondResult = await redeemInviteCode(db, found!.id, second.id);

    expect(firstResult).toBe(true);
    expect(secondResult).toBe(false);

    const row = await db.query.inviteCodes.findFirst({ where: (t, { eq }) => eq(t.id, found!.id) });
    expect(row?.usedByUserId).toBe(first.id);
  });
});
