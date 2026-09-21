/**
 * The users-bootstrap race, tested the same way Phase 1 tested the booking
 * exclusion constraint: two transactions OPEN AT THE SAME TIME, neither
 * committed when the other reads.
 *
 * Two sequential bootstraps also produce one row, and a test written that way
 * passes while proving nothing — the second one simply sees the first's
 * committed row and takes the happy path. The interleaving that actually
 * happens in production is three requests fired at once the moment a client
 * gets its session, all of which SELECT before any of them COMMIT.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQLSTATE, constraintOf, sqlStateOf } from '../src/common/sqlstate';
import { AuthRepository } from '../src/modules/auth/auth.repository';
import type { SupabaseClaims } from '../src/modules/auth/token-verifier';
import { createTestApi, dropUsers, fixtureDb, uniquePhone, type TestApi } from './support/api';

const OWNER_URL = process.env['DIRECT_URL']!;

let api: TestApi;
let repo: AuthRepository;
const planted: string[] = [];

/** A token's claims, shaped exactly as Supabase sends them — including the
 *  empty strings it uses instead of omitting a claim. */
const claimsFor = (sub: string, phone: string): SupabaseClaims => ({
  sub,
  phone,
  email: '',
  role: 'authenticated',
  user_metadata: {},
});

const track = <T extends string>(sub: T): T => {
  planted.push(sub);
  return sub;
};

beforeAll(async () => {
  api = await createTestApi();
  repo = api.app.get(AuthRepository);
});

afterAll(async () => {
  await dropUsers(planted);
  await api.close();
  await fixtureDb.$disconnect();
});

describe('what a duplicate auth_user_id actually looks like', () => {
  it('surfaces 23505 on users_auth_user_id_key from two CONCURRENT transactions', async () => {
    const sub = track(randomUUID());
    const a = new Client({ connectionString: OWNER_URL });
    const b = new Client({ connectionString: OWNER_URL });
    await a.connect();
    await b.connect();

    const insert = `
      INSERT INTO users (auth_user_id, full_name, phone, role, kyc_status)
      VALUES ($1::uuid, $2, $3, 'RENTER'::"UserRole", 'NONE'::"KycStatus")
      RETURNING id`;

    try {
      await a.query('BEGIN');
      await b.query('BEGIN');

      // Both look first and both see nothing — the SELECT-then-INSERT that
      // looks correct and is not. READ COMMITTED gives neither transaction a
      // view of the other's uncommitted row.
      const seenByA = await a.query('SELECT id FROM users WHERE auth_user_id = $1::uuid', [sub]);
      const seenByB = await b.query('SELECT id FROM users WHERE auth_user_id = $1::uuid', [sub]);
      expect(seenByA.rowCount).toBe(0);
      expect(seenByB.rowCount).toBe(0);

      await a.query(insert, [sub, 'Racer A', uniquePhone()]);

      // Do NOT await: the unique index makes B's INSERT wait on A's outcome.
      let settled = false;
      const bInsert = b
        .query(insert, [sub, 'Racer B', uniquePhone()])
        .then(() => 'inserted' as const)
        .catch((error: unknown) => error)
        .finally(() => {
          settled = true;
        });

      await new Promise((resolve) => setTimeout(resolve, 250));
      expect(settled, "B's insert should be BLOCKED on A's uncommitted row").toBe(false);

      await a.query('COMMIT');

      const outcome = await bInsert;
      expect(outcome).not.toBe('inserted');
      // Verified, not assumed. This is the exact value AuthRepository compares
      // against, and the reason the catch re-reads instead of rethrowing.
      expect(sqlStateOf(outcome)).toBe(SQLSTATE.UNIQUE_VIOLATION);
      expect(sqlStateOf(outcome)).toBe('23505');
      expect(constraintOf(outcome)).toBe('users_auth_user_id_key');

      await b.query('ROLLBACK');

      const rows = await fixtureDb.user.findMany({ where: { authUserId: sub } });
      expect(rows).toHaveLength(1);
      expect(rows[0]!.fullName).toBe('Racer A');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('still reaches sqlStateOf once Prisma has wrapped it', async () => {
    // P2039 and P2002 have both shown up in the wrong place before, so record
    // what Prisma ACTUALLY reports next to the SQLSTATE we key on.
    const sub = track(randomUUID());
    await fixtureDb.user.create({
      data: { authUserId: sub, fullName: 'First', phone: uniquePhone(), role: 'RENTER' },
    });

    let caught: unknown;
    try {
      await fixtureDb.user.create({
        data: { authUserId: sub, fullName: 'Second', phone: uniquePhone(), role: 'RENTER' },
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    // Prisma's own code for a unique violation. Not a SQLSTATE, and not the
    // P2039 an exclusion violation arrives under — which is exactly why
    // sqlStateOf digs rather than reading `.code`.
    expect((caught as { code?: string }).code).toBe('P2002');
    expect((caught as { code?: string }).code).not.toBe('23505');
    expect(sqlStateOf(caught)).toBe(SQLSTATE.UNIQUE_VIOLATION);
    expect(constraintOf(caught)).toContain('auth_user_id');
  });
});

describe('AuthRepository.findOrBootstrap under concurrency', () => {
  it('creates exactly one row for eight simultaneous first requests', async () => {
    const sub = track(randomUUID());
    const claims = claimsFor(sub, uniquePhone());

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => repo.findOrBootstrap(claims)),
    );

    const rejected = results.filter((r) => r.status === 'rejected');
    expect(rejected.map((r) => String((r as PromiseRejectedResult).reason))).toEqual([]);

    const rows = await fixtureDb.user.findMany({ where: { authUserId: sub } });
    expect(rows).toHaveLength(1);

    // Every caller got the same user, including the ones that lost the race.
    const ids = new Set(results.map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id));
    expect([...ids]).toEqual([rows[0]!.id]);
  });

  it('does NOT merge two auth identities that share a phone number', async () => {
    // A 23505 on users_phone_key is not the race — it is a second Supabase
    // identity claiming a number that already belongs to someone. Silently
    // handing over the existing account would be account takeover.
    const phone = uniquePhone();
    const first = track(randomUUID());
    const second = track(randomUUID());

    await repo.findOrBootstrap(claimsFor(first, phone));
    await expect(repo.findOrBootstrap(claimsFor(second, phone))).rejects.toThrow();

    expect(await fixtureDb.user.count({ where: { authUserId: second } })).toBe(0);
  });

  it('bootstraps two phone-only users, whose tokens both carry email ""', async () => {
    // Supabase omits nothing: a phone-OTP token has email:"". Stored as-is,
    // the SECOND phone-only signup collides with the first on the unique email
    // index and every user after the first gets a 500 on sign-in.
    const a = track(randomUUID());
    const b = track(randomUUID());

    await repo.findOrBootstrap(claimsFor(a, uniquePhone()));
    await repo.findOrBootstrap(claimsFor(b, uniquePhone()));

    const rows = await fixtureDb.user.findMany({ where: { authUserId: { in: [a, b] } } });
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.email)).toEqual([null, null]);
  });
});

describe('over HTTP', () => {
  it('does NOT answer 401 when the token was fine and the bootstrap was not', async () => {
    // The distinction the guard has to make. A contact-detail collision is a
    // server-side conflict, not an authentication failure — and answering 401
    // sends the web client into refresh-and-retry over something no amount of
    // re-authenticating can fix, so the user sees a sign-in loop instead of an
    // error somebody could act on.
    const phone = uniquePhone();
    const taken = track(randomUUID());
    await repo.findOrBootstrap(claimsFor(taken, phone));

    const newcomer = track(randomUUID());
    const response = await request(api.server)
      .get('/auth/me')
      .set('authorization', `Bearer ${await api.mint({ sub: newcomer, phone })}`);

    expect(response.status).not.toBe(401);
    expect(response.status).toBe(409);
    expect(await fixtureDb.user.count({ where: { authUserId: newcomer } })).toBe(0);
  });

  it('serves two simultaneous first requests without a 500 and without a duplicate', async () => {
    const sub = track(randomUUID());
    const token = await api.mint({ sub, phone: '+919811042399' });

    const [first, second] = await Promise.all([
      request(api.server).get('/auth/me').set('authorization', `Bearer ${token}`),
      request(api.server).get('/auth/me').set('authorization', `Bearer ${token}`),
    ]);

    expect([first!.status, second!.status]).toEqual([200, 200]);
    expect(first!.body.id).toBe(second!.body.id);

    const rows = await fixtureDb.user.findMany({ where: { authUserId: sub } });
    expect(rows).toHaveLength(1);
    expect(first!.body).toEqual({ id: rows[0]!.id, role: 'RENTER', kycStatus: 'NONE' });
  });
});
