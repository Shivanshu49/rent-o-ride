import { describe, expect, it } from 'vitest';
import { SQLSTATE, constraintOf, sqlStateOf } from './sqlstate';

describe('sqlStateOf', () => {
  it('reads a SQLSTATE off a plain node-pg error', () => {
    expect(sqlStateOf({ code: '23P01', constraint: 'bookings_no_overlap' })).toBe('23P01');
  });

  it('digs through a Prisma wrapper that nests the driver error under cause', () => {
    const error = { name: 'PrismaClientUnknownRequestError', cause: { code: '23P01' } };
    expect(sqlStateOf(error)).toBe(SQLSTATE.EXCLUSION_VIOLATION);
  });

  it('reads it from meta, which is where a known request error puts it', () => {
    expect(sqlStateOf({ code: 'P2010', meta: { code: '23505' } })).toBe('23505');
  });

  // Prisma's own P-codes are five characters too, so a naive shape check reads
  // P2002 as a SQLSTATE and never looks in meta, where the real 23505 is. The
  // filter would then fall through to a 500 for an ordinary unique violation.
  it('prefers the real SQLSTATE in meta over the Prisma code beside it', () => {
    expect(sqlStateOf({ code: 'P2002', meta: { code: '23505' } })).toBe('23505');
  });

  it('returns nothing for a bare Prisma code — there is no SQLSTATE to report', () => {
    expect(sqlStateOf({ code: 'P2002' })).toBeUndefined();
  });

  // P0001 is a genuine Postgres SQLSTATE (raise_exception), not a Prisma code.
  it('keeps the PL/pgSQL P class, which Postgres really does use', () => {
    expect(sqlStateOf({ code: 'P0001' })).toBe('P0001');
  });

  it('gives up quietly on anything else', () => {
    expect(sqlStateOf(new Error('boom'))).toBeUndefined();
    expect(sqlStateOf(null)).toBeUndefined();
    expect(sqlStateOf('23P01')).toBeUndefined();
  });

  it('does not loop forever on a self-referential cause chain', () => {
    const error: Record<string, unknown> = { message: 'x' };
    error['cause'] = error;
    expect(sqlStateOf(error)).toBeUndefined();
  });
});

describe('constraintOf', () => {
  it('names the constraint so the handler can say which rule fired', () => {
    expect(constraintOf({ code: '23P01', constraint: 'bookings_no_overlap' })).toBe(
      'bookings_no_overlap',
    );
    expect(constraintOf({ cause: { constraint: 'blackouts_no_overlap' } })).toBe(
      'blackouts_no_overlap',
    );
    expect(constraintOf({ meta: { target: 'bookings_idem_idx' } })).toBe('bookings_idem_idx');
    expect(constraintOf(new Error('boom'))).toBeUndefined();
  });
});
