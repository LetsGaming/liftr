import { timingSafeEqual } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "./env.js";

/**
 * `!==` on secrets leaks length and prefix through timing (each character comparison exits as
 * soon as one byte differs, so a closer-matching guess takes measurably longer to reject) —
 * `timingSafeEqual` compares in constant time instead. It requires equal-length buffers, so the
 * length check has to happen first; that check itself isn't constant-time, but it only leaks
 * *length*, not any byte of the token's actual content, which is the property that matters here.
 */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

/**
 * Single-bearer-token check (plan 1.1). No accounts, no sessions — the homelab reverse proxy
 * is the outer perimeter, this is just enough to stop an open LAN port being an open API.
 * Skipped entirely when LIFTR_TOKEN is unset, e.g. local dev.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  if (!env.token) return; // dev mode: no token configured
  const header = request.headers.authorization;
  if (!header || !safeEqual(header, `Bearer ${env.token}`)) {
    return reply.code(401).send({ error: "unauthorized" });
  }
}
