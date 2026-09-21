/**
 * The OTP limit, against a real Redis.
 *
 * Two things are being asserted, and the second matters more than the first:
 * that the 6th request in an hour is refused, and that the budget belongs to
 * the PHONE NUMBER rather than to the client address. Per-IP is wrong in both
 * directions — an enumerator rotates addresses and gets a fresh budget each
 * time, while everyone behind one carrier NAT shares a single one.
 */
import type { Redis } from 'ioredis';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { REDIS } from '../src/redis/redis.module';
import { OTP_WINDOW_SECONDS } from '../src/modules/auth/guards/otp-throttle.guard';
import { createTestApi, type TestApi } from './support/api';

// Reserved in supabase/config.toml under [auth.sms.test_otp]. Any other number
// makes GoTrue reach for the (deliberately fake) Twilio credentials and wait
// out a network timeout on every request, which turns a 3-second suite into a
// 20-second one for no extra coverage.
const PHONE_A = '+919811999002';
const PHONE_B = '+919811999003';

let api: TestApi;
let redis: Redis;
let max: number;

/** The guard's key. Cleared between tests so each one starts from zero. */
const budgetKey = (phone: string): string => `otp:phone:${phone}`;

const sendOtp = (phone: string, clientIp?: string) => {
  const call = request(api.server).post('/auth/otp').send({ phone });
  return clientIp ? call.set('x-forwarded-for', clientIp) : call;
};

beforeAll(async () => {
  api = await createTestApi();
  redis = api.app.get<Redis>(REDIS);
  max = api.config.get('OTP_MAX_PER_HOUR');
});

afterAll(async () => {
  await redis.del(budgetKey(PHONE_A), budgetKey(PHONE_B));
  await api.close();
});

beforeEach(async () => {
  await redis.del(budgetKey(PHONE_A), budgetKey(PHONE_B));
});

describe('OTP rate limit', () => {
  it('is configured to 5 per hour', () => {
    expect(max).toBe(5);
  });

  it('allows 5 and refuses the 6th with 429 and a Retry-After', async () => {
    for (let n = 1; n <= max; n += 1) {
      const response = await sendOtp(PHONE_A);
      // Not asserting 202. Supabase enforces a send frequency of its own and
      // also answers 429, so status alone cannot tell the two limits apart.
      // Retry-After can: OtpThrottleGuard is the only thing in the stack that
      // sets it, so its absence means OUR budget still had room.
      expect(response.headers['retry-after'], `request ${n} of ${max}`).toBeUndefined();
    }

    const blocked = await sendOtp(PHONE_A);

    expect(blocked.status).toBe(429);
    expect(blocked.body.code).toBe('RATE_LIMITED');

    const retryAfter = Number(blocked.headers['retry-after']);
    expect(Number.isInteger(retryAfter)).toBe(true);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(OTP_WINDOW_SECONDS);
    expect(blocked.body.details).toMatchObject({ retryAfterSeconds: retryAfter });
  });

  it('keeps refusing after the limit rather than letting the next one through', async () => {
    for (let n = 0; n <= max; n += 1) await sendOtp(PHONE_A);

    expect((await sendOtp(PHONE_A)).status).toBe(429);
    expect((await sendOtp(PHONE_A)).status).toBe(429);
  });

  it('expires the budget, so a blocked number is not blocked forever', async () => {
    await sendOtp(PHONE_A);
    const ttl = await redis.ttl(budgetKey(PHONE_A));

    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(OTP_WINDOW_SECONDS);
  });
});

describe('the budget is per phone, not per IP', () => {
  it('does not reset when the same number arrives from a different address', async () => {
    for (let n = 0; n <= max; n += 1) await sendOtp(PHONE_A, '203.0.113.7');

    // A new address. Per-IP throttling would hand this request a fresh budget,
    // which is precisely how an enumerator gets unlimited SMS out of us.
    const fromElsewhere = await sendOtp(PHONE_A, '198.51.100.42');

    expect(fromElsewhere.status).toBe(429);
  });

  it('does not punish a second number sharing one address', async () => {
    for (let n = 0; n <= max; n += 1) await sendOtp(PHONE_A, '203.0.113.7');
    expect((await sendOtp(PHONE_A, '203.0.113.7')).status).toBe(429);

    // Same NAT, different person. Per-IP throttling locks out the whole
    // building once one user resends a few times.
    const neighbour = await sendOtp(PHONE_B, '203.0.113.7');

    expect(neighbour.status).not.toBe(429);
  });

  it('counts one budget however the number is punctuated', async () => {
    // Otherwise the limit is bypassed by adding a space.
    for (let n = 0; n <= max; n += 1) await sendOtp(PHONE_A);

    for (const spelling of ['+91 98119 99002', '919811999002', '+91-98119-99002']) {
      const response = await sendOtp(spelling);
      expect(response.status, `spelling: ${spelling}`).toBe(429);
    }
  });
});
