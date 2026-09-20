/**
 * Development seed.
 *
 * Runs as the DATABASE OWNER, over DIRECT_URL, not as app_role.
 *
 * This is not a convenience. RLS is enabled on every table, and app_role is
 * subject to it. A seed connecting as app_role with no app.user_id set would
 * have every INSERT silently filtered by the WITH CHECK clauses — no error, no
 * rows, and a "working" seed that produced an empty database. The owner role
 * bypasses RLS, which is exactly what a data-loading script needs and exactly
 * what a request handler must never have.
 *
 * Geography columns are written with $executeRaw: Prisma has no geography type,
 * so ST_MakePoint is the only way in.
 */
import { randomUUID } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type VehicleType } from '@prisma/client';
import 'dotenv/config';

const connectionString = process.env['DIRECT_URL'];
if (!connectionString) throw new Error('DIRECT_URL is required to seed');

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = new Date();
const daysAgo = (n: number): Date => new Date(now.getTime() - n * DAY);
const daysAhead = (n: number): Date => new Date(now.getTime() + n * DAY);

/** Deterministic pseudo-random so a reseed produces the same demo data. */
let seedState = 42;
const rand = (): number => {
  seedState = (seedState * 1103515245 + 12345) % 2147483648;
  return seedState / 2147483648;
};
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;

interface SeedVehicle {
  type: VehicleType;
  brand: string;
  model: string;
  regNumber: string;
  year: number;
  city: string;
  area: string;
  /** Real coordinates — Delhi NCR. lng first when it reaches ST_MakePoint. */
  lat: number;
  lng: number;
  specs: Record<string, unknown>;
  minHours: number;
  depositRupees: number;
  includedKmPerDay: number;
  perExtraKmRupees: number;
  /** Whole rupees; converted to paise on the way in. */
  rates: { hourly: number; daily: number; weekly?: number; monthly?: number };
}

const toPaise = (rupees: number): number => Math.round(rupees * 100);

const VEHICLES: readonly SeedVehicle[] = [
  {
    type: 'CAR', brand: 'Maruti Suzuki', model: 'Swift VXi', regNumber: 'DL3CAJ4471', year: 2022,
    city: 'Delhi', area: 'Lajpat Nagar', lat: 28.5677, lng: 77.2433,
    specs: { seats: 5, fuel: 'petrol', transmission: 'manual', ac: true, luggage: 268 },
    minHours: 4, depositRupees: 2000, includedKmPerDay: 150, perExtraKmRupees: 6,
    rates: { hourly: 149, daily: 1899, weekly: 11500, monthly: 42000 },
  },
  {
    type: 'CAR', brand: 'Hyundai', model: 'Creta SX (O)', regNumber: 'DL8CAF1102', year: 2023,
    city: 'Delhi', area: 'Saket', lat: 28.5245, lng: 77.2066,
    specs: { seats: 5, fuel: 'diesel', transmission: 'automatic', ac: true, luggage: 433 },
    minHours: 4, depositRupees: 5000, includedKmPerDay: 150, perExtraKmRupees: 12,
    rates: { hourly: 279, daily: 3499, weekly: 21000, monthly: 78000 },
  },
  {
    type: 'CAR', brand: 'Tata', model: 'Nexon EV Max', regNumber: 'UP16BT8890', year: 2024,
    city: 'Noida', area: 'Sector 62', lat: 28.6274, lng: 77.3716,
    specs: { seats: 5, fuel: 'ev', transmission: 'automatic', ac: true, luggage: 350 },
    minHours: 4, depositRupees: 4000, includedKmPerDay: 200, perExtraKmRupees: 9,
    rates: { hourly: 239, daily: 2999, weekly: 18000, monthly: 66000 },
  },
  {
    type: 'CAR', brand: 'Mahindra', model: 'Thar LX 4x4', regNumber: 'UP16CJ2207', year: 2023,
    city: 'Greater Noida', area: 'Pari Chowk', lat: 28.4595, lng: 77.5026,
    specs: { seats: 4, fuel: 'diesel', transmission: 'manual', ac: true, luggage: 180 },
    minHours: 8, depositRupees: 8000, includedKmPerDay: 120, perExtraKmRupees: 18,
    rates: { hourly: 349, daily: 4299, weekly: 26000, monthly: 96000 },
  },
  {
    type: 'BIKE', brand: 'Royal Enfield', model: 'Classic 350', regNumber: 'DL4SBD7719', year: 2022,
    city: 'Delhi', area: 'Connaught Place', lat: 28.6315, lng: 77.2167,
    specs: { engineCc: 349, hasGear: true, helmetsIncluded: 2 },
    minHours: 4, depositRupees: 2000, includedKmPerDay: 120, perExtraKmRupees: 5,
    rates: { hourly: 99, daily: 1099, weekly: 6500, monthly: 24000 },
  },
  {
    type: 'BIKE', brand: 'Bajaj', model: 'Pulsar NS200', regNumber: 'UP16DM4412', year: 2023,
    city: 'Noida', area: 'Sector 18', lat: 28.5706, lng: 77.3272,
    specs: { engineCc: 199, hasGear: true, helmetsIncluded: 2 },
    minHours: 4, depositRupees: 1500, includedKmPerDay: 120, perExtraKmRupees: 4,
    rates: { hourly: 79, daily: 899, weekly: 5400, monthly: 20000 },
  },
  {
    type: 'BIKE', brand: 'Yamaha', model: 'MT-15 V2', regNumber: 'UP16EK9047', year: 2024,
    city: 'Greater Noida', area: 'Knowledge Park', lat: 28.4640, lng: 77.4950,
    specs: { engineCc: 155, hasGear: true, helmetsIncluded: 1 },
    minHours: 4, depositRupees: 1500, includedKmPerDay: 120, perExtraKmRupees: 4,
    rates: { hourly: 89, daily: 949, weekly: 5700, monthly: 21000 },
  },
  {
    type: 'SCOOTER', brand: 'Honda', model: 'Activa 6G', regNumber: 'DL3SCM5590', year: 2023,
    city: 'Delhi', area: 'Dwarka Sector 12', lat: 28.5921, lng: 77.0460,
    specs: { engineCc: 109, isElectric: false, helmetsIncluded: 2 },
    minHours: 4, depositRupees: 1000, includedKmPerDay: 150, perExtraKmRupees: 6,
    rates: { hourly: 40, daily: 500, weekly: 2800, monthly: 10000 },
  },
  {
    type: 'SCOOTER', brand: 'Ather', model: '450X', regNumber: 'UP16FL3318', year: 2024,
    city: 'Noida', area: 'Sector 137', lat: 28.5065, lng: 77.4020,
    specs: { isElectric: true, rangeKm: 146, helmetsIncluded: 2 },
    minHours: 4, depositRupees: 2000, includedKmPerDay: 100, perExtraKmRupees: 5,
    rates: { hourly: 69, daily: 799, weekly: 4700, monthly: 17000 },
  },
  {
    type: 'SCOOTER', brand: 'TVS', model: 'Jupiter 125', regNumber: 'UP16GN7756', year: 2023,
    city: 'Greater Noida', area: 'Alpha 1', lat: 28.4744, lng: 77.5040,
    specs: { engineCc: 124, isElectric: false, helmetsIncluded: 1 },
    minHours: 4, depositRupees: 1000, includedKmPerDay: 150, perExtraKmRupees: 5,
    rates: { hourly: 45, daily: 549, weekly: 3100, monthly: 11000 },
  },
  {
    type: 'BICYCLE', brand: 'Btwin', model: 'Riverside 120', regNumber: 'RORBCY0142', year: 2024,
    city: 'Noida', area: 'Sector 50', lat: 28.5700, lng: 77.3600,
    specs: { gears: 21, frameSize: 'M', isElectric: false, helmetIncluded: true },
    // Day-rate rental: no weekly or monthly slab, which is exactly the case the
    // pricing engine's slab selection has to handle without a null crash.
    minHours: 2, depositRupees: 500, includedKmPerDay: 0, perExtraKmRupees: 0,
    rates: { hourly: 25, daily: 180 },
  },
  {
    type: 'BICYCLE', brand: 'Hero', model: 'Lectro C5i (e-cycle)', regNumber: 'RORBCY0288', year: 2024,
    city: 'Greater Noida', area: 'Gaur City', lat: 28.6100, lng: 77.4400,
    specs: { gears: 7, frameSize: 'L', isElectric: true, helmetIncluded: true },
    minHours: 2, depositRupees: 500, includedKmPerDay: 0, perExtraKmRupees: 0,
    rates: { hourly: 40, daily: 320 },
  },
];

const OWNERS = [
  { fullName: 'Rohan Mehta', phone: '+919811042201', email: 'rohan.mehta@example.in', commissionBps: 1500 },
  { fullName: 'Ananya Iyer', phone: '+919811042202', email: 'ananya.iyer@example.in', commissionBps: 1800 },
  { fullName: 'Vikram Chauhan', phone: '+919811042203', email: 'vikram.chauhan@example.in', commissionBps: 1800 },
];

const RENTERS = [
  { fullName: 'Aditya Bansal', phone: '+919811042301', email: 'aditya.bansal@example.in' },
  { fullName: 'Tanvi Sethi', phone: '+919811042302', email: 'tanvi.sethi@example.in' },
  { fullName: 'Harsh Vardhan', phone: '+919811042303', email: 'harsh.vardhan@example.in' },
  { fullName: 'Ritika Goel', phone: '+919811042304', email: 'ritika.goel@example.in' },
  { fullName: 'Nikhil Bhatia', phone: '+919811042305', email: 'nikhil.bhatia@example.in' },
  { fullName: 'Ishaan Kapoor', phone: '+919811042306', email: 'ishaan.kapoor@example.in' },
];

const REVIEW_BODIES = [
  'Spotless vehicle and handover was right on time at the metro gate.',
  'Second time renting this one. Documents ready, fuel exactly as promised.',
  'Drove out to Jaipur and back with no trouble at all.',
  'Owner was responsive and flexible about a late return. Would book again.',
  'Clean, well maintained, and the pickup point was easy to find.',
  'Good value for the price. Minor scratch already noted at pickup.',
];

async function main(): Promise<void> {
  console.log('seeding as the database owner (RLS bypassed — see the file header)');

  // Idempotent: a reseed replaces the demo data rather than stacking a second
  // copy on top of it. Order matters — children before parents.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE reviews, vehicle_ratings, refunds, payments, trips, bookings,
                   blackouts, rate_cards, vehicles, risk_flags, kyc_documents,
                   referrals, owner_profiles, users, audit_log, demand_signals,
                   daily_metrics, webhook_events
    RESTART IDENTITY CASCADE
  `);

  const owners = [];
  for (const o of OWNERS) {
    const user = await prisma.user.create({
      data: {
        authUserId: randomUUID(), fullName: o.fullName, phone: o.phone, email: o.email,
        role: 'OWNER', kycStatus: 'VERIFIED',
        ownerProfile: {
          create: { commissionBps: o.commissionBps, isVerified: true, payoutAccountRef: `acc_${randomUUID().slice(0, 12)}` },
        },
      },
    });
    owners.push(user);
  }

  const renters = [];
  for (const r of RENTERS) {
    renters.push(await prisma.user.create({
      data: { authUserId: randomUUID(), ...r, role: 'RENTER', kycStatus: 'VERIFIED' },
    }));
  }

  const vehicleIds: string[] = [];
  for (const [i, v] of VEHICLES.entries()) {
    const owner = owners[i % owners.length]!;
    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: owner.id,
        type: v.type, brand: v.brand, model: v.model, regNumber: v.regNumber, year: v.year,
        specs: v.specs as object,
        images: [`vehicles/${v.regNumber.toLowerCase()}/1.jpg`, `vehicles/${v.regNumber.toLowerCase()}/2.jpg`, `vehicles/${v.regNumber.toLowerCase()}/3.jpg`],
        city: v.city, status: 'AVAILABLE', minHours: v.minHours,
        depositPaise: toPaise(v.depositRupees),
        includedKmPerDay: v.includedKmPerDay,
        perExtraKmPaise: toPaise(v.perExtraKmRupees),
        rateCards: {
          create: {
            hourlyPaise: toPaise(v.rates.hourly),
            dailyPaise: toPaise(v.rates.daily),
            weeklyPaise: v.rates.weekly === undefined ? null : toPaise(v.rates.weekly),
            monthlyPaise: v.rates.monthly === undefined ? null : toPaise(v.rates.monthly),
          },
        },
      },
    });

    // ST_MakePoint takes LONGITUDE FIRST. Swapping them puts every Delhi
    // vehicle in the Indian Ocean, and the bug is invisible until a distance
    // sort looks subtly wrong.
    await prisma.$executeRaw`
      UPDATE vehicles
         SET location = ST_SetSRID(ST_MakePoint(${v.lng}::float8, ${v.lat}::float8), 4326)::geography
       WHERE id = ${vehicle.id}::uuid
    `;
    vehicleIds.push(vehicle.id);
  }

  // A few blackouts: a service window and an owner's personal use.
  await prisma.blackout.createMany({
    data: [
      { vehicleId: vehicleIds[0]!, startAt: daysAhead(9), endAt: daysAhead(11), reason: 'Scheduled service' },
      { vehicleId: vehicleIds[3]!, startAt: daysAhead(4), endAt: daysAhead(6), reason: 'Owner travelling' },
      { vehicleId: vehicleIds[7]!, startAt: daysAhead(15), endAt: daysAhead(16), reason: 'Insurance renewal' },
    ],
  });

  // ~20 completed bookings spread over the last 90 days, so the Bayesian
  // rating and the analytics rollups have something real to chew on.
  let completed = 0;
  let reviewed = 0;
  for (let i = 0; i < 24; i++) {
    const vehicleId = vehicleIds[Math.floor(rand() * vehicleIds.length)]!;
    const renter = pick(renters);
    const startOffset = 3 + Math.floor(rand() * 85);
    const nights = 1 + Math.floor(rand() * 4);
    const startAt = daysAgo(startOffset);
    const endAt = new Date(startAt.getTime() + nights * DAY);

    const card = await prisma.rateCard.findFirst({ where: { vehicleId } });
    if (!card) continue;
    const totalPaise = card.dailyPaise * nights;
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });

    // The exclusion constraint is live during seeding too. A generated overlap
    // is a legitimate 23P01, not a seed failure — skip it and carry on, which
    // also proves the constraint works before a single test runs.
    let booking;
    try {
      booking = await prisma.booking.create({
        data: {
          vehicleId, renterId: renter.id, startAt, endAt,
          status: 'COMPLETED',
          totalPaise, depositPaise: vehicle.depositPaise,
          quoteSnapshot: { slabUsed: 'DAILY', billedUnits: nights, totalPaise },
          createdAt: daysAgo(startOffset + 2),
          confirmedAt: daysAgo(startOffset + 2),
        },
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23P01') continue;
      throw error;
    }
    completed += 1;

    // endOdo is derived from startOdo, not drawn independently: two independent
    // draws produce a backwards odometer roughly half the time, which the
    // trips_odo_forward CHECK rejects. Distance per day is bounded by type so
    // the km-overage maths in Phase 8 gets plausible numbers to work with.
    const startOdo = 10_000 + Math.floor(rand() * 40_000);
    const kmPerDay = vehicle.type === 'BICYCLE' ? 25 : vehicle.type === 'CAR' ? 180 : 90;
    const endOdo = startOdo + Math.floor(nights * kmPerDay * (0.6 + rand() * 0.9));

    await prisma.trip.create({
      data: { bookingId: booking.id, pickedUpAt: startAt, returnedAt: endAt, startOdo, endOdo },
    });

    await prisma.payment.create({
      data: {
        bookingId: booking.id, orderId: `order_${randomUUID().slice(0, 14)}`,
        paymentId: `pay_${randomUUID().slice(0, 14)}`,
        amountPaise: totalPaise, status: 'CAPTURED', method: pick(['upi', 'card', 'netbanking']),
        capturedAt: daysAgo(startOffset + 2),
      },
    });

    // Not every trip gets reviewed — a 100% review rate would make the
    // Bayesian prior look pointless, which is the opposite of the lesson.
    if (rand() < 0.72) {
      await prisma.review.create({
        data: {
          bookingId: booking.id, authorId: renter.id,
          subjectType: 'VEHICLE', subjectId: vehicleId,
          rating: rand() < 0.75 ? 5 : rand() < 0.6 ? 4 : 3,
          body: pick(REVIEW_BODIES),
          createdAt: daysAgo(startOffset - 1),
        },
      });
      reviewed += 1;
    }
  }

  // A couple of upcoming confirmed bookings so the dashboards are not empty.
  for (let i = 0; i < 3; i++) {
    const vehicleId = vehicleIds[i * 4]!;
    const vehicle = await prisma.vehicle.findUniqueOrThrow({ where: { id: vehicleId } });
    const card = await prisma.rateCard.findFirstOrThrow({ where: { vehicleId } });
    await prisma.booking.create({
      data: {
        vehicleId, renterId: renters[i]!.id,
        startAt: daysAhead(2 + i), endAt: daysAhead(3 + i),
        status: 'CONFIRMED', totalPaise: card.dailyPaise, depositPaise: vehicle.depositPaise,
        quoteSnapshot: { slabUsed: 'DAILY', billedUnits: 1, totalPaise: card.dailyPaise },
        confirmedAt: now,
      },
    });
  }

  await prisma.coupon.createMany({
    data: [
      { code: 'FIRSTRIDE', kind: 'PERCENT', value: 15, maxDiscountPaise: toPaise(500), validFrom: daysAgo(30), validTo: daysAhead(90), usageCap: 1000 },
      { code: 'NCR200', kind: 'FLAT', value: toPaise(200), validFrom: daysAgo(10), validTo: daysAhead(45), usageCap: 500 },
    ],
  });

  const counts = {
    owners: owners.length,
    renters: renters.length,
    vehicles: vehicleIds.length,
    completedBookings: completed,
    upcomingBookings: 3,
    reviews: reviewed,
    blackouts: 3,
  };
  console.table(counts);

  const geo = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM vehicles WHERE location IS NOT NULL`;
  console.log(`vehicles with a location: ${geo[0]?.n ?? 0n} / ${vehicleIds.length}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
