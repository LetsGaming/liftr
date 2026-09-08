import "fastify";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by auth.ts's requireAuth hook once the bearer token resolves to a real session. */
    userId: string;
    role: "owner" | "member";
  }
}
