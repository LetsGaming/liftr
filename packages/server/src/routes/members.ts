import { z } from "zod";
import type { LiftrDb } from "@liftr/db";
import { generateInviteCode } from "../lib/inviteCode.js";
import { requireOwner } from "../lib/requireOwner.js";
import { createInviteCode, deleteUser, findUserById, listUsers } from "../repositories/authRepository.js";
import type { ZodFastifyInstance } from "../types.js";

const INVITE_EXPIRY_MS = 24 * 60 * 60 * 1000;

const inviteResponse = z.object({ code: z.string(), expiresAt: z.string() });
const memberResponse = z.object({ id: z.string(), username: z.string(), name: z.string(), role: z.enum(["owner", "member"]), createdAt: z.date() });
const memberIdParams = z.object({ id: z.string() });
const okResponse = z.object({ ok: z.literal(true) });
const errorResponse = z.object({ error: z.string() });

/** Every route here is owner-only — `requireOwner` runs as a route-level `onRequest`, layered on
 *  top of the app-wide `requireAuth` hook that already resolved `request.role`. */
export function registerMemberRoutes(app: ZodFastifyInstance, db: LiftrDb) {
  app.post(
    "/api/members/invite",
    { onRequest: requireOwner, schema: { response: { 200: inviteResponse } } },
    async (req) => {
      const code = generateInviteCode();
      const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);
      await createInviteCode(db, { code, createdByUserId: req.userId, expiresAt });
      return { code, expiresAt: expiresAt.toISOString() };
    },
  );

  app.get(
    "/api/members",
    { onRequest: requireOwner, schema: { response: { 200: z.array(memberResponse) } } },
    async () => listUsers(db),
  );

  app.delete(
    "/api/members/:id",
    { onRequest: requireOwner, schema: { params: memberIdParams, response: { 200: okResponse, 400: errorResponse } } },
    async (req, reply) => {
      if (req.params.id === req.userId) return reply.code(400).send({ error: "cannot_delete_self" });
      const target = await findUserById(db, req.params.id);
      if (target?.role === "owner") return reply.code(400).send({ error: "cannot_delete_owner" });
      await deleteUser(db, req.params.id);
      return { ok: true as const };
    },
  );
}
