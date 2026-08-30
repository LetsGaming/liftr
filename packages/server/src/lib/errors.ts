/**
 * Typed failures for the service/repository layer (code-standards: "errors as values at the
 * boundaries" — model expected failures, `throw` only for genuinely exceptional states). A
 * service throws one of these for an *expected* outcome (the row doesn't exist, the action
 * conflicts with current state); `app.setErrorHandler` (`app.ts`) maps each to its HTTP status.
 * A route/service that throws a bare `Error` still reaches the same handler and becomes a 500 —
 * that's the correct outcome for a genuinely unexpected failure, not something to catch here.
 */
export class NotFoundError extends Error {
  constructor(message = "not_found") {
    super(message);
    this.name = "NotFoundError";
  }
}

export class ConflictError extends Error {
  constructor(message = "conflict") {
    super(message);
    this.name = "ConflictError";
  }
}
