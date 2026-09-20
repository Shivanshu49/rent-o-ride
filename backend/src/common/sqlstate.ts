/**
 * Dig the Postgres SQLSTATE out of whatever wrapper it arrived in.
 *
 * This is not defensive programming for its own sake. PrismaExceptionFilter
 * turns an exclusion violation into 409 SLOT_TAKEN, and it recognises one by
 * its SQLSTATE — but Prisma does not put the SQLSTATE on `code`. A booking
 * collision arrives as:
 *
 *   PrismaClientKnownRequestError
 *     .code = "P2039"                                   <- Prisma's own code
 *     .meta.driverAdapterError.cause.code = "23P01"     <- the one that matters
 *
 * A naive `error.code === '23P01'` check misses it, and the most important
 * error mapping in the system quietly becomes a 500. Raw node-pg errors (the
 * concurrency tests use those) put it on `.code` directly, and older Prisma
 * versions nest it differently again — so this searches instead of guessing.
 *
 * The other subtlety: Prisma codes are five characters too. Prisma uses
 * P1000-P6999; Postgres only uses the P class for P0000-P0004 (PL/pgSQL). So a
 * code matching /^P[1-9]/ is Prisma's, and taking it as the SQLSTATE would mean
 * never looking in the place the real one is.
 */

const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;
const PRISMA_CODE = /^P[1-9]\d{3}$/;

/** Where wrappers stash the thing they wrapped. Searched in this order. */
const LINKS = ['cause', 'meta', 'driverAdapterError', 'error', 'originalError'] as const;
const MAX_NODES = 32;

const isSqlState = (value: unknown): value is string =>
  typeof value === 'string' && SQLSTATE_SHAPE.test(value) && !PRISMA_CODE.test(value);

export function sqlStateOf(error: unknown): string | undefined {
  for (const node of walk(error)) {
    for (const key of ['originalCode', 'code', 'sqlState'] as const) {
      if (isSqlState(node[key])) return node[key] as string;
    }
  }
  return undefined;
}

/** Constraint name, when Postgres told us which one blew up. */
export function constraintOf(error: unknown): string | undefined {
  for (const node of walk(error)) {
    for (const key of ['constraint', 'constraint_name', 'target'] as const) {
      if (typeof node[key] === 'string') return node[key] as string;
    }
  }

  // Prisma drops the structured `constraint` field on some paths but keeps the
  // Postgres message, which always names the constraint in quotes.
  for (const node of walk(error)) {
    for (const key of ['originalMessage', 'message'] as const) {
      const text = node[key];
      if (typeof text !== 'string') continue;
      const match = /violates (?:\w+ )*constraint "([^"]+)"/.exec(text);
      if (match) return match[1];
    }
  }
  return undefined;
}

/**
 * Breadth-first over the wrapper chain. Bounded by node count and guarded
 * against cycles, because an error whose `cause` is itself must not hang the
 * exception filter.
 */
function* walk(error: unknown): Generator<Record<string, unknown>> {
  const seen = new Set<unknown>();
  const queue: unknown[] = [error];

  for (let visited = 0; queue.length > 0 && visited < MAX_NODES; visited += 1) {
    const node = queue.shift();
    if (!node || typeof node !== 'object' || seen.has(node)) continue;
    seen.add(node);

    const record = node as Record<string, unknown>;
    yield record;
    for (const link of LINKS) queue.push(record[link]);
  }
}

export const SQLSTATE = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  INSUFFICIENT_PRIVILEGE: '42501',
  GENERATED_COLUMN_WRITE: '428C9',
} as const;
