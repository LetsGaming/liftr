/** A small, deliberately short list of the most-guessed passwords (top entries from public
 *  breach-frequency lists, plus keyboard-walk patterns and this app's own name) — not a
 *  comprehensive breach-corpus check (that would need an external API/large wordlist this
 *  self-hosted app has no business depending on), just enough to block the handful of guesses
 *  that would be tried first in any real attack. Matched case-insensitively so "Password1"
 *  doesn't sneak past "password1". */
const COMMON_PASSWORDS = new Set([
  "password", "password1", "12345678", "123456789", "qwertyui", "qwerty123",
  "letmein1", "admin1234", "welcome1", "changeme", "aaaaaaaa", "11111111",
  "abc12345", "iloveyou", "liftrapp", "liftr123", "trustno1", "football",
  "baseball", "dragon12", "monkey12", "shadow12", "master12", "superman",
]);

export function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

/** The passwordSchema refine's exact message (routes/auth.ts) — shared so app.ts's error handler
 *  can recognize this specific validation failure and return a dedicated `password_too_common`
 *  error code instead of the generic `invalid_request`, without duplicating the literal string. */
export const COMMON_PASSWORD_MESSAGE = "too common, choose a different password";
