import { describe, expect, it } from "vitest";
import { generateInviteCode } from "~server/lib/inviteCode.js";

describe("generateInviteCode", () => {
  it("returns an 8-character code", () => {
    expect(generateInviteCode()).toHaveLength(8);
  });

  it("only uses uppercase letters and digits, excluding 0/O/1/I", () => {
    for (let i = 0; i < 50; i++) {
      expect(generateInviteCode()).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
    }
  });

  it("returns different codes across calls (not a fixed sequence)", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});
