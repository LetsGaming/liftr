import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by userContext.ts's onRequest hook, after auth. Always the owner today (single
     *  shared bearer token, no accounts yet) — see resolveCurrentUserId. */
    userId: string;
  }
}
