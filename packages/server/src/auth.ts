import type { FastifyReply, FastifyRequest } from "fastify";
import type { LiftrDb } from "@liftr/db";
import { findSessionByTokenHash, touchSession } from "./repositories/authRepository.js";
import { hashSessionToken } from "./lib/sessionTokens.js";

/**
 * Every `/api/*` request carries a bearer token; this looks it up against `sessions` and, on a
 * hit, sets `request.userId`/`request.role` for the rest of the request to use. Replaces the old
 * single-shared-token check and the separate `userContext.ts` hook that used to run after it —
 * those were two hooks doing halves of the same lookup; this is the one place identity gets
 * resolved now.
 */
export function requireAuth(db: LiftrDb) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const tokenHash = hashSessionToken(token);
    const session = await findSessionByTokenHash(db, tokenHash);
    if (!session) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    request.userId = session.userId;
    request.role = session.role;
    await touchSession(db, tokenHash);
  };
}
