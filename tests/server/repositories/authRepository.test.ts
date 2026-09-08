import { beforeEach, describe, expect, it } from "vitest";
import { OWNER_USER_ID, type LiftrDb } from "@liftr/db";
import { createTestDb } from "../helpers/testDb.js";
import {
  createInviteCode,
  createSession,
  deleteSessionByTokenHash,
  deleteUser,
  findOwnerUser,
  findSessionByTokenHash,
  findUserByUsername,
  findUserById,
  findValidInviteCode,
  insertUser,
  listUsers,
  redeemInviteCode,
  setUserPassword,
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
  });

  it("returns undefined for an unknown token hash", async () => {
    expect(await findSessionByTokenHash(db, "does-not-exist")).toBeUndefined();
  });

  it("touchSession does not throw for an existing session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-2");
    await expect(touchSession(db, "hash-2")).resolves.not.toThrow();
  });

  it("deleteSessionByTokenHash removes the session", async () => {
    await createSession(db, OWNER_USER_ID, "hash-3");
    await deleteSessionByTokenHash(db, "hash-3");
    expect(await findSessionByTokenHash(db, "hash-3")).toBeUndefined();
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
});
