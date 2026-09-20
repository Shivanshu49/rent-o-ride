/**
 * What a constraint violation actually looks like by the time Prisma is done
 * wrapping it.
 *
 * This matters more than it sounds. The whole booking flow depends on
 * PrismaExceptionFilter turning an exclusion violation into 409 SLOT_TAKEN, and
 * that filter recognises the error by its SQLSTATE. Prisma does not surface
 * SQLSTATE as `code` — it surfaces its own P-code — so if sqlStateOf() cannot
 * dig 23P01 back out, the most important error mapping in the system silently
 * becomes a 500.
 *
 * Asserted against a real database because the wrapper shape is Prisma's
 * business and changes between versions.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SQLSTATE, constraintOf, sqlStateOf } from '../src/common/sqlstate';
import 'dotenv/config';

const admin = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DIRECT_URL']! }),
});

const DAY = 86_400_000;
const at = (d: number): Date => new Date(Date.parse('2029-06-01T00:00:00Z') + d * DAY);

let vehicleId: string;
let renterId: string;
let ownerId: string;

beforeAll(async () => {
  const owner = await admin.user.create({
    data: { authUserId: randomUUID(), fullName: 'Shape Owner', phone: `+91990${Date.now() % 10000000}`, role: 'OWNER' },
  });
  const renter = await admin.user.create({
    data: { authUserId: randomUUID(), fullName: 'Shape Renter', phone: `+91991${Date.now() % 10000000}`, role: 'RENTER' },
  });
  const vehicle = await admin.vehicle.create({
    data: { ownerId: owner.id, type: 'BIKE', brand: 'Shape', model: 'Probe', regNumber: `SHP${Date.now()}`, year: 2024, city: 'Noida', status: 'AVAILABLE' },
  });
  ownerId = owner.id;
  renterId = renter.id;
  vehicleId = vehicle.id;
});

afterAll(async () => {
  await admin.booking.deleteMany({ where: { vehicleId } });
  await admin.vehicle.delete({ where: { id: vehicleId } });
  await admin.user.deleteMany({ where: { id: { in: [ownerId, renterId] } } });
  await admin.$disconnect();
});

const mkBooking = (from: number, to: number) =>
  admin.booking.create({
    data: { vehicleId, renterId, startAt: at(from), endAt: at(to), status: 'CONFIRMED', totalPaise: 100_000 },
  });

describe('sqlStateOf, against errors Prisma actually throws', () => {
  it('recovers 23P01 from an exclusion violation Prisma reports as P2039', async () => {
    const first = await mkBooking(0, 3);
    let caught: unknown;
    try {
      await mkBooking(1, 4);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeDefined();
    // Prisma's own code, for the record — this is what a naive
    // `error.code === '23P01'` check would see and miss.
    expect((caught as { code?: string }).code).not.toBe('23P01');
    expect(sqlStateOf(caught)).toBe(SQLSTATE.EXCLUSION_VIOLATION);
    expect(constraintOf(caught)).toBe('bookings_no_overlap');

    await admin.booking.delete({ where: { id: first.id } });
  });

  it('recovers 23505 from a unique violation', async () => {
    const dup = `DUP${Date.now()}`;
    const a = await admin.vehicle.create({
      data: { ownerId, type: 'BIKE', brand: 'Dup', model: 'A', regNumber: dup, year: 2024, city: 'Noida' },
    });
    let caught: unknown;
    try {
      await admin.user.create({
        data: { authUserId: randomUUID(), fullName: 'Dupe', phone: (await admin.user.findUniqueOrThrow({ where: { id: renterId } })).phone, role: 'RENTER' },
      });
    } catch (error) {
      caught = error;
    }

    expect(sqlStateOf(caught)).toBe(SQLSTATE.UNIQUE_VIOLATION);
    await admin.vehicle.delete({ where: { id: a.id } });
  });

  it('recovers 23514 from a check violation', async () => {
    let caught: unknown;
    try {
      await mkBooking(10, 10); // end_at must be > start_at
    } catch (error) {
      caught = error;
    }

    expect(sqlStateOf(caught)).toBe(SQLSTATE.CHECK_VIOLATION);
  });
});
