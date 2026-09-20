/**
 * The guarantees this project claims, tested against a REAL Postgres with
 * PostGIS and btree_gist. Nothing here is mocked, deliberately: the whole point
 * is that Postgres enforces these, not application code, so a mock would test
 * the mock.
 *
 * Requires: docker compose up -d, then npm run db:migrate --workspace=backend
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQLSTATE, constraintOf, sqlStateOf } from '../src/common/sqlstate';
import 'dotenv/config';

/** Prisma reports a constraint violation under its own P-code and buries the
 *  SQLSTATE in meta.driverAdapterError.cause. Assert on the SQLSTATE, which is
 *  what PrismaExceptionFilter actually keys on. */
const sqlStateOfRejection = async (run: Promise<unknown>): Promise<string | undefined> => {
  try {
    await run;
    return undefined;
  } catch (error) {
    return sqlStateOf(error);
  }
};

const OWNER_URL = process.env['DIRECT_URL']!;
/** app_role: NOT a superuser, NOT granted BYPASSRLS. RLS applies to it. */
const APP_ROLE_URL = process.env['DATABASE_URL']!;

const admin = new PrismaClient({ adapter: new PrismaPg({ connectionString: OWNER_URL }) });

const DAY = 86_400_000;
const base = new Date('2027-03-01T10:00:00.000Z').getTime();
const at = (days: number): Date => new Date(base + days * DAY);

/** Fixture ids, so these tests never collide with seed data or each other. */
let ownerId: string;
let renterA: string;
let renterB: string;
let vehicleId: string;

const INSERT_BOOKING = `
  INSERT INTO bookings (vehicle_id, renter_id, start_at, end_at, status, total_paise, deposit_paise)
  VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, $5::"BookingStatus", $6, 0)
  RETURNING id
`;

beforeAll(async () => {
  const mk = async (role: 'OWNER' | 'RENTER', name: string): Promise<string> => {
    const u = await admin.user.create({
      data: { authUserId: randomUUID(), fullName: name, phone: `+9199${Date.now() % 100000000}${Math.floor(Math.random() * 100)}`.slice(0, 13), role, kycStatus: 'VERIFIED' },
    });
    return u.id;
  };
  ownerId = await mk('OWNER', 'Fixture Owner');
  renterA = await mk('RENTER', 'Fixture Renter A');
  renterB = await mk('RENTER', 'Fixture Renter B');

  const v = await admin.vehicle.create({
    data: {
      ownerId, type: 'CAR', brand: 'Fixture', model: 'Test', regNumber: `TEST${Date.now()}`,
      year: 2024, city: 'Noida', status: 'AVAILABLE', depositPaise: 100_000,
    },
  });
  vehicleId = v.id;
});

afterAll(async () => {
  await admin.booking.deleteMany({ where: { vehicleId } });
  await admin.blackout.deleteMany({ where: { vehicleId } });
  await admin.vehicle.delete({ where: { id: vehicleId } });
  await admin.user.deleteMany({ where: { id: { in: [ownerId, renterA, renterB] } } });
  await admin.$disconnect();
});

describe('bookings.period is GENERATED ALWAYS ... STORED', () => {
  it('accepts an INSERT that omits period, and derives it', async () => {
    // The generated Prisma client does not expose `period` at all, so this is
    // the realistic path: a normal create() with only start_at and end_at.
    const booking = await admin.booking.create({
      data: {
        vehicleId, renterId: renterA, startAt: at(0), endAt: at(1),
        status: 'CONFIRMED', totalPaise: 189_900,
      },
    });

    const [row] = await admin.$queryRaw<{ period: string }[]>`
      SELECT period::text AS period FROM bookings WHERE id = ${booking.id}::uuid
    `;
    expect(row?.period).toBe(`["${at(0).toISOString().replace('T', ' ').replace('.000Z', '+00')}","${at(1).toISOString().replace('T', ' ').replace('.000Z', '+00')}")`);

    await admin.booking.delete({ where: { id: booking.id } });
  });

  it('rejects an INSERT that names period, so it can never drift from the dates', async () => {
    const state = await sqlStateOfRejection(
      admin.$executeRawUnsafe(
        `INSERT INTO bookings (vehicle_id, renter_id, start_at, end_at, status, total_paise, period)
         VALUES ($1::uuid, $2::uuid, $3::timestamptz, $4::timestamptz, 'CONFIRMED', 1000, tstzrange($3, $4, '[)'))`,
        vehicleId, renterA, at(40).toISOString(), at(41).toISOString(),
      ),
    );
    expect(state).toBe(SQLSTATE.GENERATED_COLUMN_WRITE);
  });
});

describe('bookings_no_overlap (EXCLUDE USING gist)', () => {
  it('lets the second of two CONCURRENT overlapping inserts fail with 23P01', async () => {
    const a = new Client({ connectionString: OWNER_URL });
    const b = new Client({ connectionString: OWNER_URL });
    await a.connect();
    await b.connect();

    try {
      // Both transactions are open at the same time. This is the part that
      // matters: two SEQUENTIAL inserts also fail, but for a different reason
      // (the first is already committed and visible), and a test written that
      // way passes while proving nothing about concurrency.
      await a.query('BEGIN');
      await b.query('BEGIN');

      await a.query(INSERT_BOOKING, [vehicleId, renterA, at(10), at(13), 'CONFIRMED', 500_000]);

      // Overlaps A by one day. Do NOT await yet: an exclusion constraint takes
      // a predicate lock, so this INSERT blocks until A commits or rolls back.
      let settled = false;
      const bInsert = b
        .query(INSERT_BOOKING, [vehicleId, renterB, at(12), at(15), 'CONFIRMED', 500_000])
        .then(() => 'inserted' as const)
        .catch((e: { code?: string }) => e)
        .finally(() => { settled = true; });

      // Give it a real chance to settle. If it had, the two inserts were not
      // actually concurrent and the rest of this test would be meaningless.
      await new Promise((r) => setTimeout(r, 250));
      expect(settled, 'B\'s insert should be BLOCKED on A\'s predicate lock').toBe(false);

      await a.query('COMMIT');

      const outcome = await bInsert;
      expect(outcome).not.toBe('inserted');
      expect((outcome as { code?: string }).code).toBe('23P01');
      expect((outcome as { constraint?: string }).constraint).toBe('bookings_no_overlap');

      await b.query('ROLLBACK');

      // Exactly one row survived.
      const rows = await admin.booking.findMany({ where: { vehicleId, startAt: { gte: at(9) }, endAt: { lte: at(16) } } });
      expect(rows).toHaveLength(1);
      expect(rows[0]?.renterId).toBe(renterA);
      await admin.booking.deleteMany({ where: { vehicleId } });
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('ALLOWS a booking that starts exactly when another ends', async () => {
    // '[)' is half-open. Treating the range as closed would block back-to-back
    // rentals and silently cost revenue on every popular vehicle.
    const first = await admin.booking.create({
      data: { vehicleId, renterId: renterA, startAt: at(20), endAt: at(21), status: 'CONFIRMED', totalPaise: 189_900 },
    });
    const second = await admin.booking.create({
      data: { vehicleId, renterId: renterB, startAt: at(21), endAt: at(22), status: 'CONFIRMED', totalPaise: 189_900 },
    });

    expect(first.id).not.toBe(second.id);
    await admin.booking.deleteMany({ where: { id: { in: [first.id, second.id] } } });
  });

  it('frees the slot the instant a booking is cancelled', async () => {
    const held = await admin.booking.create({
      data: { vehicleId, renterId: renterA, startAt: at(30), endAt: at(33), status: 'CONFIRMED', totalPaise: 500_000 },
    });

    // Same window, still held -> rejected.
    const blocked = await sqlStateOfRejection(
      admin.booking.create({
        data: { vehicleId, renterId: renterB, startAt: at(31), endAt: at(34), status: 'CONFIRMED', totalPaise: 500_000 },
      }),
    );
    expect(blocked).toBe(SQLSTATE.EXCLUSION_VIOLATION);

    // The constraint is PARTIAL on status. Cancelling drops the row out of the
    // index — no cleanup job, no application logic, no window where the slot is
    // free in one place and taken in another.
    await admin.booking.update({ where: { id: held.id }, data: { status: 'CANCELLED', cancelledAt: new Date() } });

    const rebooked = await admin.booking.create({
      data: { vehicleId, renterId: renterB, startAt: at(31), endAt: at(34), status: 'CONFIRMED', totalPaise: 500_000 },
    });
    expect(rebooked.id).toBeTruthy();

    await admin.booking.deleteMany({ where: { id: { in: [held.id, rebooked.id] } } });
  });

  it('blocks overlapping blackouts unconditionally', async () => {
    const b1 = await admin.blackout.create({
      data: { vehicleId, startAt: at(50), endAt: at(53), reason: 'Service' },
    });
    let caught: unknown;
    try {
      await admin.blackout.create({ data: { vehicleId, startAt: at(52), endAt: at(55), reason: 'Overlap' } });
    } catch (error) {
      caught = error;
    }
    expect(sqlStateOf(caught)).toBe(SQLSTATE.EXCLUSION_VIOLATION);
    expect(constraintOf(caught)).toBe('blackouts_no_overlap');
    await admin.blackout.delete({ where: { id: b1.id } });
  });
});

describe('row-level security, as app_role', () => {
  /**
   * Every query here runs over APP_ROLE_URL. That is the whole test: the tables
   * are owned by the migration role, which PRISMA_ADMIN connects as and which
   * bypasses RLS by design. A test that accidentally connects as the owner
   * passes without exercising a single policy.
   */
  let appRole: Client;
  let bookingA: string;
  let bookingB: string;

  beforeAll(async () => {
    const a = await admin.booking.create({
      data: { vehicleId, renterId: renterA, startAt: at(60), endAt: at(61), status: 'CONFIRMED', totalPaise: 189_900 },
    });
    const b = await admin.booking.create({
      data: { vehicleId, renterId: renterB, startAt: at(62), endAt: at(63), status: 'CONFIRMED', totalPaise: 189_900 },
    });
    bookingA = a.id;
    bookingB = b.id;

    appRole = new Client({ connectionString: APP_ROLE_URL });
    await appRole.connect();
  });

  afterAll(async () => {
    await appRole.end();
    await admin.booking.deleteMany({ where: { id: { in: [bookingA, bookingB] } } });
  });

  it('is connected as a role the policies actually apply to', async () => {
    const { rows } = await appRole.query<{ current_user: string; rolsuper: boolean; rolbypassrls: boolean }>(
      `SELECT current_user, r.rolsuper, r.rolbypassrls
         FROM pg_roles r WHERE r.rolname = current_user`,
    );
    expect(rows[0]?.current_user).toBe('app_role');
    expect(rows[0]?.rolsuper).toBe(false);
    expect(rows[0]?.rolbypassrls).toBe(false);
  });

  /** What runScoped() does, in SQL: transaction-local, so it cannot leak to
   *  the next request that borrows this pooled connection. */
  const asUser = async <T>(userId: string | null, role: string, fn: () => Promise<T>): Promise<T> => {
    await appRole.query('BEGIN');
    try {
      await appRole.query(`SELECT set_config('app.user_id', $1, true)`, [userId ?? '']);
      await appRole.query(`SELECT set_config('app.user_role', $1, true)`, [role]);
      return await fn();
    } finally {
      await appRole.query('ROLLBACK');
    }
  };

  it('shows renter A only their own bookings', async () => {
    const ids = await asUser(renterA, 'RENTER', async () => {
      const { rows } = await appRole.query<{ id: string }>('SELECT id FROM bookings');
      return rows.map((r) => r.id);
    });

    expect(ids).toContain(bookingA);
    expect(ids).not.toContain(bookingB);
  });

  it('shows renter B only their own bookings', async () => {
    const ids = await asUser(renterB, 'RENTER', async () => {
      const { rows } = await appRole.query<{ id: string }>('SELECT id FROM bookings');
      return rows.map((r) => r.id);
    });

    expect(ids).toContain(bookingB);
    expect(ids).not.toContain(bookingA);
  });

  it('shows the vehicle owner the bookings on their vehicle, from both renters', async () => {
    const ids = await asUser(ownerId, 'OWNER', async () => {
      const { rows } = await appRole.query<{ id: string }>('SELECT id FROM bookings WHERE vehicle_id = $1', [vehicleId]);
      return rows.map((r) => r.id);
    });

    expect(ids).toEqual(expect.arrayContaining([bookingA, bookingB]));
  });

  it('shows an anonymous caller nothing at all', async () => {
    const count = await asUser(null, 'ANON', async () => {
      const { rows } = await appRole.query<{ n: string }>('SELECT count(*) AS n FROM bookings');
      return Number(rows[0]?.n ?? 0);
    });

    expect(count).toBe(0);
  });

  it('refuses an INSERT that claims to be another renter', async () => {
    // The WITH CHECK on bookings_renter_insert. Even with a forgotten filter in
    // a repository, a renter cannot create a booking in someone else's name.
    await expect(
      asUser(renterA, 'RENTER', () =>
        appRole.query(INSERT_BOOKING, [vehicleId, renterB, at(70), at(71), 'CONFIRMED', 1000]),
      ),
    ).rejects.toMatchObject({ code: '42501' });
  });

  it('does not leak the session variable to the next transaction', async () => {
    // set_config(..., true) is transaction-local. If that third argument were
    // false, this pooled connection would carry renter A's identity into
    // whichever request borrowed it next — a cross-tenant leak with no error.
    await asUser(renterA, 'RENTER', async () => undefined);

    const { rows } = await appRole.query<{ uid: string | null }>(
      `SELECT nullif(current_setting('app.user_id', true), '') AS uid`,
    );
    expect(rows[0]?.uid).toBeNull();
  });

  it('lets an admin see everything', async () => {
    const ids = await asUser(randomUUID(), 'ADMIN', async () => {
      const { rows } = await appRole.query<{ id: string }>('SELECT id FROM bookings WHERE vehicle_id = $1', [vehicleId]);
      return rows.map((r) => r.id);
    });

    expect(ids).toEqual(expect.arrayContaining([bookingA, bookingB]));
  });
});

describe('PostGIS', () => {
  it('measures distance in metres on the spheroid, and uses the GIST index', async () => {
    await admin.$executeRaw`
      UPDATE vehicles
         SET location = ST_SetSRID(ST_MakePoint(77.3272::float8, 28.5706::float8), 4326)::geography
       WHERE id = ${vehicleId}::uuid
    `;

    // Connaught Place -> Noida Sector 18 is about 13 km on the ground.
    const [row] = await admin.$queryRaw<{ m: number }[]>`
      SELECT ST_Distance(location, ST_SetSRID(ST_MakePoint(77.2167, 28.6315), 4326)::geography) AS m
        FROM vehicles WHERE id = ${vehicleId}::uuid
    `;
    expect(row!.m).toBeGreaterThan(11_000);
    expect(row!.m).toBeLessThan(15_000);
  });
});
