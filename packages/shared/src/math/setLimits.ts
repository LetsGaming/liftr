/**
 * Plausibility ceiling for a single logged set. Rank/XP are computed straight from weightKg/reps
 * with no other upper bound, so without this a typo'd or fabricated value could inflate both
 * indefinitely. Shared so the client can clamp the stepper (the UI simply can't construct an
 * implausible value) and the server can still reject one server-side, as defense-in-depth
 * against a request that didn't go through the normal UI — a client-only clamp doesn't stop a
 * direct API call or tampered local data.
 *
 * Deliberately generous: this is a floor against garbage input (a typo's extra zero, a stray
 * tap on the stepper's fast-repeat), not a claim about what's humanly achievable — a real elite
 * lift (~500kg deadlift) stays just under the ceiling.
 */
export const MAX_PLAUSIBLE_WEIGHT_KG = 500;
export const MAX_PLAUSIBLE_REPS = 200;
