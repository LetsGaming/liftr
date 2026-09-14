import { describe, expect, it } from "vitest";
import { generateSessionToken, hashSessionToken } from "~server/lib/sessionTokens.js";

describe("generateSessionToken", () => {
  it("returns a 64-character hex string (32 random bytes)", () => {
    const token = generateSessionToken();
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns a different token on each call", () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });
});

describe("hashSessionToken", () => {
  it("is deterministic for the same input", () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it("returns a 64-character hex string (SHA-256)", () => {
    expect(hashSessionToken("whatever")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSessionToken("a")).not.toBe(hashSessionToken("b"));
  });
});
