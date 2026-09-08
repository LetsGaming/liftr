import type { FastifyReply, FastifyRequest } from "fastify";
import { OWNER_USER_ID } from "@liftr/db";

/**
 * Single-shared-bearer-token deployments (today's only supported mode) have exactly one
 * identity: the owner. Once per-person login lands, this resolves from the verified session
 * instead — every call site downstream already reads `request.userId` rather than the constant,
 * so that swap won't touch routes/services/repositories at all.
 */
export function resolveCurrentUserId(_request: FastifyRequest): string {
  return OWNER_USER_ID;
}

/** Runs after auth (app.ts's onRequest ordering) so every `/api/*` handler can read
 *  `request.userId` without re-deriving it. */
export function registerUserContext(app: { addHook: (name: "onRequest", fn: (request: FastifyRequest, reply: FastifyReply) => Promise<void>) => void }) {
  app.addHook("onRequest", async (request) => {
    request.userId = resolveCurrentUserId(request);
  });
}
