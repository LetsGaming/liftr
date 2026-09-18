/**
 * `pnpm reset-password -- --user <username> --password '<new password>'` — the only recovery path
 * for a forgotten password (there is no email/SMTP anywhere in this app, see
 * docs/SECURITY.md#auth-model). Host filesystem access to the server's SQLite file is the root of
 * trust here, same bargain as any other self-hosted admin task (`pnpm db:migrate`, editing `.env`).
 *
 * Also signs the user out everywhere — a forgotten-password reset is exactly the situation where
 * you want every existing session (including a possibly-compromised one) killed, not preserved.
 */
import { hashPassword } from "./lib/passwords.js";
import { isCommonPassword } from "./lib/commonPasswords.js";
import { db } from "./db.js";
import { deleteOtherSessionsForUser, findUserByUsername, setUserPassword } from "./repositories/authRepository.js";

function parseArgs(argv: string[]): { user?: string; password?: string } {
  const out: { user?: string; password?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--user") out.user = argv[++i];
    else if (argv[i] === "--password") out.password = argv[++i];
  }
  return out;
}

async function main() {
  const { user: username, password } = parseArgs(process.argv.slice(2));
  if (!username || !password) {
    console.error("Usage: pnpm reset-password -- --user <username> --password '<new password>'");
    process.exit(1);
  }
  // Same rules as any other password (auth.ts's passwordSchema) — reusing the raw checks here
  // rather than importing the zod schema, since that schema lives in routes/auth.ts alongside
  // route-only concerns (rate-limit configs) this script has no business pulling in.
  if (password.length < 8 || password.length > 128) {
    console.error("Password must be 8-128 characters.");
    process.exit(1);
  }
  if (isCommonPassword(password)) {
    console.error("That password is too common — choose a different one.");
    process.exit(1);
  }

  const user = await findUserByUsername(db, username);
  if (!user) {
    console.error(`No user named "${username}".`);
    process.exit(1);
  }

  await setUserPassword(db, user.id, await hashPassword(password));
  await deleteOtherSessionsForUser(db, user.id);
  console.log(`Password reset for "${username}" (${user.role}). All of their sessions were signed out.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
