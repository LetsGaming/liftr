import type { FastifyReply, FastifyRequest } from "fastify";

/** Layered after `requireAuth` on routes only the owner may call — assumes `request.role` is
 *  already set, so this must never be the only auth hook on a route. */
export async function requireOwner(request: FastifyRequest, reply: FastifyReply) {
  if (request.role !== "owner") {
    return reply.code(403).send({ error: "owner_only" });
  }
}
