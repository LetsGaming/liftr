import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { hashPassword, verifyPassword } from "../lib/passwords.js";
import { generateSessionToken, hashSessionToken } from "../lib/sessionTokens.js";
import { isCommonPassword } from "../lib/commonPasswords.js";
import {
  createSession,
  deleteSessionByTokenHash,
  deleteUser,
  findOwnerUser,
  findUserByUsername,
  findUserById,
  findValidInviteCode,
  insertUser,
  redeemInviteCode,
  setUserPassword,
} from "../repositories/authRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const USERNAME_PATTERN = /^[a-z0-9-]{3,24}$/;
const usernameSchema = z.string().regex(USERNAME_PATTERN, "3-24 lowercase letters, digits, or hyphens");
const passwordSchema = z
  .string()
  .min(8, "at least 8 characters")
  .refine((pw) => !isCommonPassword(pw), { message: "too common, choose a different password" });

const setupInput = z.object({ password: passwordSchema });
const loginInput = z.object({ username: usernameSchema, password: z.string() });
const registerInput = z.object({ code: z.string().length(8), username: usernameSchema, password: passwordSchema });

/** A real hash (in the same `scrypt:N:r:p:salt:hash` format `hashPassword` produces — see
 *  passwords.ts) computed once at module load and used only as a timing decoy in `/api/auth/login`
 *  below, so a lookup for a nonexistent username still pays the full scrypt cost before returning
 *  401 — never used to actually authenticate. Computed via `hashPassword` (rather than hand-crafted)
 *  so the format is guaranteed valid; the one-time cost at startup is negligible. */
const dummyPasswordHashPromise = hashPassword("dummy-password-for-timing");

/** 10 attempts per 15 minutes per username (falling back to IP when no username is present, e.g.
 *  a malformed body or /api/auth/setup which takes no username) — generous enough that a real
 *  user fat-fingering their password a few times never gets blocked, tight enough to make
 *  scripted guessing impractical even parallelized across a handful of connections. Scoped to
 *  these three routes only: they're the ones an attacker can use to guess a credential (password
 *  or invite code); every other route already requires a valid session.
 *
 *  Keyed on `req.body.username` rather than the default `req.ip`: this app's documented
 *  deployment sits behind a reverse proxy with no `trustProxy` configured (see
 *  docs/operations/docker-deployment.md), so every real client's `request.ip` resolves to the
 *  proxy's own address — an IP-only key would put every legitimate user behind one shared bucket,
 *  letting an outsider lock everyone out with 10 failed attempts. `hook: "preHandler"` is required
 *  so `request.body` has already been parsed/validated when the key generator runs (the default
 *  hook, onRequest, runs before body parsing). */
const authRateLimit = {
  rateLimit: {
    max: 10,
    timeWindow: "15 minutes",
    hook: "preHandler" as const,
    keyGenerator: (req: import("fastify").FastifyRequest) => {
      const username = (req.body as { username?: unknown } | undefined)?.username;
      return typeof username === "string" && username.length > 0 ? username : req.ip;
    },
  },
};

const tokenResponse = z.object({ token: z.string() });
const statusResponse = z.object({ needsSetup: z.boolean() });
const meResponse = z.object({ id: z.string(), username: z.string(), name: z.string(), role: z.enum(["owner", "member"]) });
const okResponse = z.object({ ok: z.literal(true) });
/** Every non-200 branch below returns one of these — declared per status code on each route's own
 *  `schema.response` (fastify-type-provider-zod only lets `reply.code(n).send(...)` target a
 *  status the schema actually lists) so the error shape stays checked like everything else here. */
const errorResponse = z.object({ error: z.string(), detail: z.string().optional() });

async function issueSession(db: LiftrDb, userId: string) {
  const token = generateSessionToken();
  await createSession(db, userId, hashSessionToken(token));
  return token;
}

/** No auth is required on setup/login/register — they're how a bearer token is obtained in the
 *  first place. `/me` and `/logout` need one, wired via `app.ts`'s auth hook. */
export function registerAuthRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.get("/api/auth/status", { schema: { response: { 200: statusResponse } } }, async () => {
    const owner = await findOwnerUser(db);
    return { needsSetup: owner?.passwordHash == null };
  });

  app.post(
    "/api/auth/setup",
    { config: authRateLimit, schema: { body: setupInput, response: { 200: tokenResponse, 409: errorResponse, 500: errorResponse } } },
    async (req, reply) => {
      const owner = await findOwnerUser(db);
      if (!owner) return reply.code(500).send({ error: "no_owner" });
      if (owner.passwordHash != null) return reply.code(409).send({ error: "already_set_up" });
      await setUserPassword(db, owner.id, await hashPassword(req.body.password));
      return { token: await issueSession(db, owner.id) };
    },
  );

  app.post(
    "/api/auth/login",
    { config: authRateLimit, schema: { body: loginInput, response: { 200: tokenResponse, 401: errorResponse } } },
    async (req, reply) => {
      const user = await findUserByUsername(db, req.body.username);
      if (!user?.passwordHash) {
        // No such user (or setup never ran): still pay the full scrypt cost against a dummy hash
        // so this branch takes about as long as a wrong-password check below. Otherwise a
        // nonexistent username short-circuits fast while a real username with a wrong password
        // pays ~128 MiB of scrypt work, letting an attacker enumerate valid usernames by timing.
        // The result is discarded — it never gates authentication.
        await verifyPassword(req.body.password, await dummyPasswordHashPromise);
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      if (!(await verifyPassword(req.body.password, user.passwordHash))) {
        return reply.code(401).send({ error: "invalid_credentials" });
      }
      return { token: await issueSession(db, user.id) };
    },
  );

  app.post(
    "/api/auth/register",
    { config: authRateLimit, schema: { body: registerInput, response: { 200: tokenResponse, 400: errorResponse, 409: errorResponse } } },
    async (req, reply) => {
      const invite = await findValidInviteCode(db, req.body.code.toUpperCase());
      if (!invite) return reply.code(400).send({ error: "invalid_invite_code" });
      const existing = await findUserByUsername(db, req.body.username);
      if (existing) return reply.code(409).send({ error: "username_taken" });
      const user = await insertUser(db, {
        username: req.body.username,
        name: req.body.username,
        role: "member",
        passwordHash: await hashPassword(req.body.password),
      });
      // `findValidInviteCode` (check) and redeeming (act) are separate steps, so two concurrent
      // registrations against the same still-unused code can both pass the check above before
      // either redeems it. `redeemInviteCode` is a conditional update — `usedByUserId IS NULL` in
      // its WHERE clause — that only one concurrent caller can actually claim; the other gets
      // `false` back. The user row has to be inserted first (not after, as one might expect for a
      // "redeem before commit" flow) because `invite_codes.used_by_user_id` has a FOREIGN KEY
      // against `users.id`, so the redemption can't reference a user that doesn't exist yet.
      // Instead, atomicity from the caller's perspective is achieved by deleting the just-inserted
      // user when the redemption loses the race, so a losing caller never ends up with — or the
      // system never ends up holding — an account it didn't actually earn with a valid code.
      const redeemed = await redeemInviteCode(db, invite.id, user.id);
      if (!redeemed) {
        await deleteUser(db, user.id);
        return reply.code(400).send({ error: "invalid_invite_code" });
      }
      return { token: await issueSession(db, user.id) };
    },
  );

  app.get("/api/auth/me", { schema: { response: { 200: meResponse, 404: errorResponse } } }, async (req, reply) => {
    const user = await findUserById(db, req.userId);
    if (!user) return reply.code(404).send({ error: "not_found" });
    return { id: user.id, username: user.username, name: user.name, role: user.role };
  });

  app.post("/api/auth/logout", { schema: { response: { 200: okResponse } } }, async (req) => {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (token) await deleteSessionByTokenHash(db, hashSessionToken(token));
    return { ok: true as const };
  });

  // Self-service account deletion (data-export/deletion right, not owner-gated like
  // routes/members.ts's DELETE /api/members/:id). The owner can't self-delete this way — there's
  // no one left to run the app's owner-only routes afterward — so an owner wanting out has to
  // hand off ownership or wipe the whole instance, not delete their own row.
  app.delete(
    "/api/auth/me",
    { schema: { response: { 200: okResponse, 400: errorResponse } } },
    async (req, reply) => {
      const user = await findUserById(db, req.userId);
      if (user?.role === "owner") return reply.code(400).send({ error: "cannot_delete_owner" });
      await deleteUser(db, req.userId); // cascades to this user's sessions, workouts, runs, etc.
      return { ok: true as const };
    },
  );
}
