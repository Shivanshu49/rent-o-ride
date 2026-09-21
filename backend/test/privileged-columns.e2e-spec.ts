/**
 * Column-level privileges, asserted against a real app_role connection.
 *
 * RLS decides WHICH ROWS a caller may touch. It has no opinion about COLUMNS —
 * so `users_self_update`, "you may update your own row", also meant "you may
 * set your own row's role to ADMIN". `20260921120000_privileged_columns` takes
 * the grant away instead of adding a policy or a trigger, and Postgres then
 * refuses the statement with 42501 before it plans it.
 *
 * Every case here runs raw SQL over DATABASE_URL. Going through Prisma would
 * test what Prisma chose to put in the SET list; going through a repository
 * would test that the repository did not ask. Neither is the guarantee. The
 * guarantee is that the database refuses, whatever the client, including psql.
 */
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQLSTATE, sqlStateOf } from '../src/common/sqlstate';
import { fixtureDb, uniquePhone } from './support/api';

const APP_ROLE_URL = process.env['DATABASE_URL']!;

let appRole: Client;
let userId: string;
let otherUserId: string;
let vehicleId: string;
let bookingId: string;
let documentId: string;

/** Run `sql` as app_role with a user context, the way a request would. */
const asUser = async (actorId: string, sql: string, params: unknown[] = []): Promise<void> => {
  await appRole.query('BEGIN');
  try {
    await appRole.query("SELECT set_config('app.user_id', $1, true)", [actorId]);
    await appRole.query("SELECT set_config('app.user_role', 'RENTER', true)", []);
    await appRole.query(sql, params);
    await appRole.query('COMMIT');
  } catch (error) {
    await appRole.query('ROLLBACK');
    throw error;
  }
};

/** The SQLSTATE app_role gets back, or undefined when the write went through. */
const refusalFor = async (actorId: string, sql: string, params: unknown[] = []): Promise<string | undefined> => {
  try {
    await asUser(actorId, sql, params);
    return undefined;
  } catch (error) {
    return sqlStateOf(error);
  }
};

beforeAll(async () => {
  appRole = new Client({ connectionString: APP_ROLE_URL });
  await appRole.connect();

  const mk = async (): Promise<string> => {
    const user = await fixtureDb.user.create({
      data: { authUserId: randomUUID(), fullName: 'Priv Fixture', phone: uniquePhone(), role: 'OWNER' },
      select: { id: true },
    });
    return user.id;
  };
  userId = await mk();
  otherUserId = await mk();

  await fixtureDb.ownerProfile.create({ data: { userId } });

  const vehicle = await fixtureDb.vehicle.create({
    data: {
      ownerId: userId, type: 'CAR', brand: 'Priv', model: 'Probe',
      regNumber: `PRV${Date.now()}`, year: 2024, city: 'Noida', status: 'SUSPENDED',
    },
    select: { id: true },
  });
  vehicleId = vehicle.id;

  const booking = await fixtureDb.booking.create({
    data: {
      vehicleId, renterId: userId,
      startAt: new Date('2031-01-01T10:00:00Z'), endAt: new Date('2031-01-03T10:00:00Z'),
      status: 'CONFIRMED', totalPaise: 500_000,
    },
    select: { id: true },
  });
  bookingId = booking.id;
  await fixtureDb.trip.create({ data: { bookingId } });

  const document = await fixtureDb.kycDocument.create({
    data: { userId, docType: 'DRIVING_LICENCE', storagePath: `${userId}/probe.png` },
    select: { id: true },
  });
  documentId = document.id;
});

afterAll(async () => {
  await fixtureDb.trip.deleteMany({ where: { bookingId } });
  await fixtureDb.booking.deleteMany({ where: { vehicleId } });
  await fixtureDb.kycDocument.deleteMany({ where: { userId } });
  await fixtureDb.vehicle.deleteMany({ where: { id: vehicleId } });
  await fixtureDb.ownerProfile.deleteMany({ where: { userId } });
  await fixtureDb.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
  await appRole.end();
  await fixtureDb.$disconnect();
});

describe('app_role is connected the way a request is', () => {
  it('is not a superuser and does not bypass RLS', async () => {
    const { rows } = await appRole.query<{ u: string; s: boolean; b: boolean }>(
      `SELECT current_user AS u, rolsuper AS s, rolbypassrls AS b
         FROM pg_roles WHERE rolname = current_user`,
    );
    expect(rows[0]!.u).toBe('app_role');
    expect(rows[0]!.s).toBe(false);
    expect(rows[0]!.b).toBe(false);
  });
});

describe('privilege columns — the escalation that was possible', () => {
  it('refuses to let a user make themselves an ADMIN', async () => {
    const state = await refusalFor(userId, `UPDATE users SET role = 'ADMIN' WHERE id = $1::uuid`, [userId]);

    expect(state).toBe(SQLSTATE.INSUFFICIENT_PRIVILEGE);
    expect(state).toBe('42501');

    const after = await fixtureDb.user.findUniqueOrThrow({ where: { id: userId } });
    expect(after.role).toBe('OWNER');
  });

  it('refuses to let a user verify their own KYC', async () => {
    const state = await refusalFor(userId, `UPDATE users SET kyc_status = 'VERIFIED' WHERE id = $1::uuid`, [userId]);

    expect(state).toBe('42501');
    expect((await fixtureDb.user.findUniqueOrThrow({ where: { id: userId } })).kycStatus).toBe('NONE');
  });

  it('refuses to let a user repoint their row at another Supabase identity', async () => {
    const state = await refusalFor(
      userId,
      `UPDATE users SET auth_user_id = $2::uuid WHERE id = $1::uuid`,
      [userId, randomUUID()],
    );
    expect(state).toBe('42501');
  });

  it('refuses the whole statement even when only one column is privileged', async () => {
    // Postgres checks every column in the SET list. Hiding `role` behind a
    // legitimate field is the shape a mass-assignment bug actually has.
    const state = await refusalFor(
      userId,
      `UPDATE users SET full_name = 'Legit', role = 'ADMIN' WHERE id = $1::uuid`,
      [userId],
    );

    expect(state).toBe('42501');
    // And it is atomic: the harmless half did not land either.
    expect((await fixtureDb.user.findUniqueOrThrow({ where: { id: userId } })).fullName).toBe('Priv Fixture');
  });

  it('still lets a user change their own contact details', async () => {
    const name = `Renamed ${Date.now()}`;
    await asUser(userId, `UPDATE users SET full_name = $2 WHERE id = $1::uuid`, [userId, name]);

    expect((await fixtureDb.user.findUniqueOrThrow({ where: { id: userId } })).fullName).toBe(name);
  });
});

describe('owner_profiles — self-verification and self-set commission', () => {
  it.each([
    ['is_verified', `UPDATE owner_profiles SET is_verified = true WHERE user_id = $1::uuid`],
    ['commission_bps', `UPDATE owner_profiles SET commission_bps = 0 WHERE user_id = $1::uuid`],
    ['reliability', `UPDATE owner_profiles SET reliability = 100 WHERE user_id = $1::uuid`],
  ])('refuses UPDATE of %s', async (_column, sql) => {
    expect(await refusalFor(userId, sql, [userId])).toBe('42501');
  });

  it('refuses an INSERT that sets its own verification', async () => {
    // The hole that was live: nothing in `owner_profiles_self_insert` looked at
    // is_verified, so applying and approving yourself was one statement.
    const state = await refusalFor(
      otherUserId,
      `INSERT INTO owner_profiles (user_id, is_verified, commission_bps) VALUES ($1::uuid, true, 0)`,
      [otherUserId],
    );

    expect(state).toBe('42501');
    expect(await fixtureDb.ownerProfile.count({ where: { userId: otherUserId } })).toBe(0);
  });

  it('still lets an owner apply, on the honest defaults', async () => {
    // The ordinary action this table has in Phase 2. Neither privileged column
    // is named, so the database supplies them — which is the point: the values
    // an owner sees are the ones they could not have chosen.
    await asUser(
      otherUserId,
      `INSERT INTO owner_profiles (user_id, payout_account_ref) VALUES ($1::uuid, $2)`,
      [otherUserId, 'acc_test_1'],
    );

    const row = await fixtureDb.ownerProfile.findUniqueOrThrow({ where: { userId: otherUserId } });
    expect(row.payoutAccountRef).toBe('acc_test_1');
    expect(row.isVerified).toBe(false);
    expect(row.commissionBps).toBe(1800);
    expect(row.reliability).toBe(100);
  });

  it('has no self-UPDATE grant at all, matching the absence of a policy', async () => {
    // A grant with no policy behind it is a permission that reads as allowed
    // and behaves as a silent no-op. Assert the two agree.
    const { rows } = await appRole.query<{ c: string }>(
      `SELECT column_name AS c FROM information_schema.column_privileges
        WHERE grantee = 'app_role' AND table_name = 'owner_profiles' AND privilege_type = 'UPDATE'`,
    );
    expect(rows).toEqual([]);
  });
});

describe('vehicles.status — an owner must not un-suspend themselves', () => {
  it('refuses to move a SUSPENDED vehicle back to AVAILABLE', async () => {
    const state = await refusalFor(userId, `UPDATE vehicles SET status = 'AVAILABLE' WHERE id = $1::uuid`, [vehicleId]);

    expect(state).toBe('42501');
    expect((await fixtureDb.vehicle.findUniqueOrThrow({ where: { id: vehicleId } })).status).toBe('SUSPENDED');
  });

  it('refuses to publish by inserting an AVAILABLE vehicle outright', async () => {
    const state = await refusalFor(
      userId,
      `INSERT INTO vehicles (owner_id, type, brand, model, reg_number, year, city, status)
       VALUES ($1::uuid, 'BIKE'::"VehicleType", 'X', 'Y', $2, 2024, 'Noida', 'AVAILABLE'::"VehicleStatus")`,
      [userId, `SNEAK${Date.now()}`],
    );
    expect(state).toBe('42501');
  });

  it('still lets an owner edit and soft-delete their own listing', async () => {
    await asUser(userId, `UPDATE vehicles SET city = 'Gurugram', deposit_paise = 250000 WHERE id = $1::uuid`, [vehicleId]);
    await asUser(userId, `UPDATE vehicles SET deleted_at = now() WHERE id = $1::uuid`, [vehicleId]);

    const row = await fixtureDb.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    expect(row.city).toBe('Gurugram');
    expect(row.depositPaise).toBe(250_000);
    expect(row.deletedAt).not.toBeNull();
  });
});

describe('kyc_documents.status — the row must not assert its own verdict', () => {
  it('refuses an INSERT claiming VERIFIED', async () => {
    const state = await refusalFor(
      userId,
      `INSERT INTO kyc_documents (user_id, doc_type, storage_path, status)
       VALUES ($1::uuid, 'SELFIE'::"DocType", 'anything.png', 'VERIFIED'::"KycStatus")`,
      [userId],
    );

    expect(state).toBe('42501');
    expect(await fixtureDb.kycDocument.count({ where: { userId, status: 'VERIFIED' } })).toBe(0);
  });

  it('refuses an UPDATE to VERIFIED', async () => {
    expect(
      await refusalFor(userId, `UPDATE kyc_documents SET status = 'VERIFIED' WHERE id = $1::uuid`, [documentId]),
    ).toBe('42501');
  });

  it('still lets a document be opened, landing on the PENDING default', async () => {
    await asUser(
      userId,
      `INSERT INTO kyc_documents (user_id, doc_type, storage_path) VALUES ($1::uuid, 'ID_PROOF'::"DocType", $2)`,
      [userId, `${userId}/ok-${Date.now()}.png`],
    );

    const row = await fixtureDb.kycDocument.findFirstOrThrow({
      where: { userId, docType: 'ID_PROOF' },
      orderBy: { createdAt: 'desc' },
    });
    expect(row.status).toBe('PENDING');
  });
});

describe('money and state machines', () => {
  it.each([
    ['bookings.status', `UPDATE bookings SET status = 'COMPLETED' WHERE id = $1::uuid`],
    ['bookings.total_paise', `UPDATE bookings SET total_paise = 0 WHERE id = $1::uuid`],
  ])('refuses UPDATE of %s', async (_label, sql) => {
    expect(await refusalFor(userId, sql, [bookingId])).toBe('42501');
  });

  it.each([
    ['trips.late_fee_paise', `UPDATE trips SET late_fee_paise = 0 WHERE booking_id = $1::uuid`],
    ['trips.damage_paise', `UPDATE trips SET damage_paise = 0 WHERE booking_id = $1::uuid`],
  ])('refuses UPDATE of %s', async (_label, sql) => {
    expect(await refusalFor(userId, sql, [bookingId])).toBe('42501');
  });

  it('refuses a referral that pays itself', async () => {
    const state = await refusalFor(
      userId,
      `INSERT INTO referrals (code, referrer_id, reward_paise) VALUES ($2, $1::uuid, 10000000)`,
      [userId, `REF${Date.now()}`],
    );
    expect(state).toBe('42501');
  });
});

describe('audit_log — a log its subjects can write is not a log', () => {
  it('refuses a forged entry', async () => {
    const state = await refusalFor(
      userId,
      `INSERT INTO audit_log (actor_id, action, entity) VALUES ($1::uuid, 'admin.kyc.approve', 'kyc_documents')`,
      [userId],
    );
    expect(state).toBe('42501');
  });

  it('refuses to rewrite or delete an existing entry', async () => {
    const entry = await fixtureDb.auditLog.create({
      data: { actorId: userId, action: 'probe', entity: 'users', entityId: userId },
      select: { id: true },
    });

    expect(await refusalFor(userId, `UPDATE audit_log SET action = 'nothing' WHERE id = $1::uuid`, [entry.id])).toBe('42501');
    expect(await refusalFor(userId, `DELETE FROM audit_log WHERE id = $1::uuid`, [entry.id])).toBe('42501');

    await fixtureDb.auditLog.delete({ where: { id: entry.id } });
  });
});

describe('a new table does not inherit a write grant', () => {
  it('gives app_role SELECT and INSERT by default, not UPDATE or DELETE', async () => {
    // How this class of hole comes back: somebody adds a table in Phase 7 and
    // it silently picks up blanket UPDATE from ALTER DEFAULT PRIVILEGES.
    await fixtureDb.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS _priv_probe (id int primary key)');
    try {
      const { rows } = await appRole.query<{ p: string }>(
        `SELECT privilege_type AS p FROM information_schema.table_privileges
          WHERE grantee = 'app_role' AND table_name = '_priv_probe'`,
      );
      const granted = rows.map((r) => r.p).sort();
      expect(granted).toEqual(['INSERT', 'SELECT']);
    } finally {
      await fixtureDb.$executeRawUnsafe('DROP TABLE IF EXISTS _priv_probe');
    }
  });
});
