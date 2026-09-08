import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "~server/lib/passwords.js";

describe("hashPassword / verifyPassword", () => {
  it("verifies a password against its own hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(await verifyPassword("wrong password", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt), even for the same password", async () => {
    const a = await hashPassword("same password");
    const b = await hashPassword("same password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same password", a)).toBe(true);
    expect(await verifyPassword("same password", b)).toBe(true);
  });

  it("stores the hash as scrypt:N:r:p:salt:hash, colon-joined", async () => {
    const hash = await hashPassword("whatever");
    const parts = hash.split(":");
    expect(parts).toHaveLength(6);
    const [algo, n, r, p, salt, digest] = parts;
    expect(algo).toBe("scrypt");
    expect(n).toBe("131072");
    expect(r).toBe("8");
    expect(p).toBe("1");
    expect(salt).toMatch(/^[0-9a-f]+$/);
    expect(digest).toMatch(/^[0-9a-f]+$/);
  });

  it("returns false (does not throw) for a garbage/wrong-shaped stored value", async () => {
    await expect(verifyPassword("whatever", "not-a-real-hash")).resolves.toBe(false);
    await expect(verifyPassword("whatever", "scrypt:131072:8:1:deadbeef")).resolves.toBe(false);
  });
});
