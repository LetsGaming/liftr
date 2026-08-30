import type { FastifyBaseLogger, FastifyInstance, RawReplyDefaultExpression, RawRequestDefaultExpression, RawServerDefault } from "fastify";
import type { ZodTypeProvider } from "fastify-type-provider-zod";

/**
 * The app instance every `register*Routes(app, db)` function receives, once `app.ts` calls
 * `.withTypeProvider<ZodTypeProvider>()` — route `schema.body`/`schema.response` accept zod
 * objects directly and get real request/response types, instead of every handler manually
 * calling `.parse()` on an untyped `req.body`.
 */
export type ZodFastifyInstance = FastifyInstance<RawServerDefault, RawRequestDefaultExpression, RawReplyDefaultExpression, FastifyBaseLogger, ZodTypeProvider>;
