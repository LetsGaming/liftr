import { randomInt } from "node:crypto";

/** Excludes 0/O and 1/I — the pair each is easy to misread when copied by hand from one device
 *  to another, which is the realistic way an invite code travels in this app. */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateInviteCode(): string {
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += ALPHABET[randomInt(ALPHABET.length)];
  }
  return code;
}
