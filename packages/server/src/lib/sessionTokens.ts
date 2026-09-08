import { createHash, randomBytes } from "node:crypto";

/** A fresh bearer token — 32 random bytes, hex-encoded. Handed to the client once at login/setup/
 *  register time and never stored server-side in this form (see `hashSessionToken`). */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** SHA-256 of a bearer token, hex-encoded — this, not the raw token, is what `sessions.tokenHash`
 *  stores and what an incoming request's `Authorization` header is compared against. A plain hash
 *  (not scrypt) is fine here: the input space is already a full 256 bits of randomness, so there's
 *  no brute-force-a-weak-password concern the way there is for `passwords.ts`. */
export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
