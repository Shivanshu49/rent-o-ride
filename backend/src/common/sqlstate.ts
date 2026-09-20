/**
 * Dig the Postgres SQLSTATE out of whatever wrapper it arrived in.
 *
 * With Prisma driver adapters a constraint violation can surface as a
 * PrismaClientKnownRequestError with the real code in `meta`, or as the raw
 * node-pg error nested under `cause`. The exclusion-constraint handling in
 * Phase 6 depends on recognising 23P01 either way, so the digging lives here.
 *
 * The subtle part is telling a SQLSTATE from a Prisma code: both are five
 * characters. Prisma uses P1000–P6999; Postgres only uses the P class for
 * P0000–P0004 (PL/pgSQL). So a code matching /^P[1-9]/ is Prisma's, and taking
 * it as the SQLSTATE would make the exception filter miss the real violation
 * sitting right next to it in `meta`.
 */

const SQLSTATE_SHAPE = /^[0-9A-Z]{5}$/;
const PRISMA_CODE = /^P[1-9]\d{3}$/;

const isSqlState = (value: unknown): value is string =>
  typeof value === 'string' && SQLSTATE_SHAPE.test(value) && !PRISMA_CODE.test(value);

export function sqlStateOf(error: unknown): string | undefined {
  for (const node of walk(error)) {
    const meta = node['meta'] as Record<string, unknown> | undefined;

    // meta first: when Prisma wraps a driver error, meta holds the SQLSTATE and
    // the top-level code is Prisma's own. A bare Prisma code yields undefined
    // rather than itself — there is no SQLSTATE here, and returning one anyway
    // would have the exception filter map an error it does not understand.
    for (const candidate of [meta?.['code'], node['code'], node['sqlState']]) {
      if (isSqlState(candidate)) return candidate;
    }
  }

  return undefined;
}

/** Constraint name, when Postgres told us which one blew up. */
export function constraintOf(error: unknown): string | undefined {
  for (const node of walk(error)) {
    if (typeof node['constraint'] === 'string') return node['constraint'];
    const meta = node['meta'] as Record<string, unknown> | undefined;
    const fromMeta = meta?.['constraint'] ?? meta?.['target'];
    if (typeof fromMeta === 'string') return fromMeta;
  }
  return undefined;
}

/** Walk the cause chain, bounded, and tolerant of a self-referential `cause`. */
function* walk(error: unknown): Generator<Record<string, unknown>> {
  const seen = new Set<unknown>();
  let node: unknown = error;
  for (let depth = 0; node && typeof node === 'object' && depth < 5; depth += 1) {
    if (seen.has(node)) return;
    seen.add(node);
    yield node as Record<string, unknown>;
    node = (node as Record<string, unknown>)['cause'];
  }
}

export const SQLSTATE = {
  UNIQUE_VIOLATION: '23505',
  EXCLUSION_VIOLATION: '23P01',
  CHECK_VIOLATION: '23514',
  FOREIGN_KEY_VIOLATION: '23503',
  INSUFFICIENT_PRIVILEGE: '42501',
} as const;
