import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";
import { promisify } from "node:util";

// `scrypt`'s overloads don't include a (password, salt, keylen, options) => Buffer signature that
// `promisify` picks up automatically, so the wrapper is typed explicitly here.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;
const KEY_LENGTH = 64;

/** OWASP-recommended scrypt cost parameters for an interactive login KDF (2024 guidance). scrypt's
 *  memory requirement is ~128 * N * r bytes, which for these values is ~128 MiB, so callers must
 *  pass an explicit `maxmem` above Node's 32 MiB default or scrypt throws ERR_CRYPTO_INVALID_SCRYPT_PARAMS. */
const SCRYPT_N = 131072; // 2^17
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_MAXMEM = 256 * 1024 * 1024;
const ALGO_TAG = "scrypt";

/** Hashes a password with a fresh random salt. Stored format is self-describing so future
 *  parameter/algorithm changes can be rolled out without invalidating existing hashes:
 *
 *    scrypt:N:r:p:salt:hash
 *
 *  where N/r/p are the actual scrypt cost parameters used (decimal), salt/hash are hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await scryptAsync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  })) as Buffer;
  return `${ALGO_TAG}:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${derived.toString("hex")}`;
}

/** Constant-time comparison against a stored `scrypt:N:r:p:salt:hash` string. The N/r/p parameters
 *  are parsed from the stored value itself (not the current constants above) so that re-deriving
 *  the hash for comparison uses whatever cost parameters actually produced it — this is what makes
 *  the format tolerate a future parameter change without invalidating hashes made under the old one.
 *  Any malformed/wrong-shaped input (wrong part count, non-numeric N/r/p, wrong algorithm tag, or a
 *  hex/length mismatch) is treated as a mismatch and returns `false` rather than throwing. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 6) return false;
  const [algo, nStr, rStr, pStr, saltHex, hashHex] = parts as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  if (algo !== ALGO_TAG) return false;
  if (!saltHex || !hashHex) return false;
  if (!/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;

  if (!/^[0-9]+$/.test(nStr) || !/^[0-9]+$/.test(rStr) || !/^[0-9]+$/.test(pStr)) return false;
  const N = Number(nStr);
  const r = Number(rStr);
  const p = Number(pStr);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) return false;
  if (N <= 0 || r <= 0 || p <= 0) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");

  let derived: Buffer;
  try {
    derived = (await scryptAsync(password, salt, expected.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    })) as Buffer;
  } catch {
    return false;
  }

  if (derived.length !== expected.length) return false;
  return timingSafeEqual(derived, expected);
}
