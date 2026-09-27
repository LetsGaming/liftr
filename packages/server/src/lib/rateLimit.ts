import type { FastifyRequest } from "fastify";

/** Per-user rate limit for authenticated routes that are cheap to call but expensive to serve
 *  (a batch DB write, a file parse, an external API call). Unlike `auth.ts`'s `authRateLimit`,
 *  these routes require a session already, so `req.userId` (set by the app-wide auth hook, which
 *  always runs first) is a stable, spoof-proof key, so no IP/reverse-proxy caveat is needed here. */
export function userRateLimit(max: number, timeWindow: string) {
  return {
    rateLimit: {
      max,
      timeWindow,
      keyGenerator: (req: FastifyRequest) => req.userId,
    },
  };
}
