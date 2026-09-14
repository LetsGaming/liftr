import { describe, expect, it } from "vitest";
import { isCommonPassword } from "~server/lib/commonPasswords.js";

describe("isCommonPassword", () => {
  it("flags well-known weak passwords, case-insensitively", () => {
    expect(isCommonPassword("password")).toBe(true);
    expect(isCommonPassword("Password")).toBe(true);
    expect(isCommonPassword("PASSWORD1")).toBe(true);
    expect(isCommonPassword("aaaaaaaa")).toBe(true);
    expect(isCommonPassword("12345678")).toBe(true);
    expect(isCommonPassword("qwertyui")).toBe(true);
  });

  it("does not flag a reasonably random password", () => {
    expect(isCommonPassword("Xk9$mQ2vLp7z")).toBe(false);
  });
});
