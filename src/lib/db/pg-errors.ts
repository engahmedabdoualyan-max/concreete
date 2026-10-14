/**
 * ============================================================
 *  FIMTO SOFT — CONCRETE PLANT ERP
 *  Postgres error helpers
 *  src/lib/db/pg-errors.ts
 * ============================================================
 *
 *  WHY THIS FILE EXISTS
 *  ─────────────────────────────────────────────────────────
 *  Drizzle wraps every driver error in its own `DrizzleQueryError`,
 *  so a Postgres unique-violation arrives as:
 *
 *      DrizzleQueryError { cause: DatabaseError { code: '23505' } }
 *
 *  Checking `err.code === '23505'` on the top-level object therefore
 *  NEVER matches, and the route returns a 500 for what is really a
 *  perfectly ordinary "that code is taken" conflict. This bug shipped
 *  silently in one route before it was caught by an end-to-end test,
 *  so the check lives here once, unwraps the whole chain, and is
 *  used everywhere.
 *
 *  Also worth knowing: this repository declares uniqueness as unique
 *  INDEXES, not table CONSTRAINTs, so `err.constraint` is often
 *  undefined for a duplicate-key error. Never key a decision on it
 *  without a fallback.
 */

/** Postgres SQLSTATE for unique_violation. */
export const UNIQUE_VIOLATION = "23505";

/** Postgres SQLSTATE for check_violation (e.g. a stock total going negative). */
export const CHECK_VIOLATION = "23514";

/** Walk an error's `cause` chain and return the first defined SQLSTATE. */
function findSqlState(err: unknown, depth = 0): string | undefined {
  if (depth > 8 || err === null || typeof err !== "object") return undefined;

  const code = (err as { code?: unknown }).code;
  if (typeof code === "string" && /^\d{5}$/.test(code)) return code;

  return findSqlState((err as { cause?: unknown }).cause, depth + 1);
}

/**
 * Did this error come from a unique index / constraint?
 *
 * Use this instead of inspecting `err.code` directly.
 */
export function isUniqueViolation(err: unknown): boolean {
  return findSqlState(err) === UNIQUE_VIOLATION;
}

/** Did this error come from a CHECK constraint? */
export function isCheckViolation(err: unknown): boolean {
  return findSqlState(err) === CHECK_VIOLATION;
}

/**
 * The index or constraint that rejected the write, when Postgres names one.
 *
 * Returns undefined for violations raised by a bare unique index rather than a
 * named constraint, so always treat this as advisory and supply your own
 * fallback message.
 */
export function violationName(err: unknown): string | undefined {
  let cur: unknown = err;
  for (let depth = 0; depth < 8 && cur && typeof cur === "object"; depth++) {
    const constraint = (cur as { constraint?: unknown }).constraint;
    if (typeof constraint === "string" && constraint) return constraint;
    cur = (cur as { cause?: unknown }).cause;
  }
  return undefined;
}