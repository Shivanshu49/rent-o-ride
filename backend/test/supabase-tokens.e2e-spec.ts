/**
 * The other end of the claim: tokens a REAL Supabase Auth issued, verified
 * against its REAL published JWKS over the network.
 *
 * Everything else in the suite mints its own ES256 tokens so it can produce an
 * expired or wrongly-audienced one on demand. That covers the crypto but not
 * the compatibility — whether what Supabase actually puts in a token lines up
 * with what TokenVerifier and the users bootstrap expect. It did not, the first
 * time this ran: a phone-OTP token carries `email: ""` rather than omitting the
 * claim, and storing that empty string collides on the unique email index the
 * moment a SECOND phone-only user signs in.
 *
 * Requires a Supabase on SUPABASE_URL. `npx supabase start` provides one, with
 * the fixed OTP codes declared in supabase/config.toml, so the handshake never
 * depends on an SMS provider. Skipped when it is not running rather than
 * failing, because it is the only suite here that needs more than Postgres and
 * Redis.
 */
import type { Redis } from 'ioredis';
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify } from 'jose';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REDIS } from '../src/redis/redis.module';
import { createTestApi, dropUsers, fixtureDb, needsSupabase, probeSupabase, tamper, type TestApi } from './support/api';

/** Declared in supabase/config.toml under [auth.sms.test_otp]. */
const TEST_PHONE = '919811999001';
const TEST_CODE = '123456';

const supabaseUrl = (process.env['SUPABASE_URL'] ?? '').replace(/\/$/, '');

let api: TestApi;
let accessToken: string;
let refreshToken: string;
let authUserId: string;

beforeAll(async () => {
  if (!(await probeSupabase())) return;

  // The real JWKS, fetched over HTTP by jose, cached, refetched on an unknown
  // kid. No test key set anywhere in this file.
  api = await createTestApi([], { useRealJwks: true });

  // Our own OTP budget is 5/hour/phone and this suite is not about that.
  await api.app.get<Redis>(REDIS).del(`otp:phone:+${TEST_PHONE}`);

  const sent = await request(api.server).post('/auth/otp').send({ phone: TEST_PHONE });
  expect(sent.status, JSON.stringify(sent.body)).toBe(202);

  const verified = await request(api.server)
    .post('/auth/otp/verify')
    .send({ phone: TEST_PHONE, token: TEST_CODE });

  expect(verified.status, JSON.stringify(verified.body)).toBe(200);
  accessToken = verified.body.accessToken;
  refreshToken = verified.body.refreshToken;
  authUserId = JSON.parse(
    Buffer.from(accessToken.split('.')[1]!, 'base64url').toString(),
  ).sub as string;
});

afterAll(async () => {
  if (!api) return;
  await dropUsers([authUserId]);
  await api.close();
  await fixtureDb.$disconnect();
});

describe('a token Supabase actually issued', () => {
  it('is ES256, signed by a key published at the JWKS endpoint', async (ctx) => {
    needsSupabase(ctx);
    const header = decodeProtectedHeader(accessToken);
    expect(header.alg).toBe('ES256');
    expect(header.kid).toBeTruthy();

    // Independently of our verifier: the published key set verifies it.
    const jwks = createRemoteJWKSet(new URL(`${supabaseUrl}/auth/v1/.well-known/jwks.json`));
    const { payload } = await jwtVerify(accessToken, jwks);
    expect(payload.iss).toBe(`${supabaseUrl}/auth/v1`);
    expect(payload.aud).toBe('authenticated');
  });

  it('carries email as an empty string, not as an absent claim', (ctx) => {
    needsSupabase(ctx);
    // The thing that broke the bootstrap. Asserted so nobody "tidies up" the
    // handling in auth.repository.ts on the assumption that Supabase omits it.
    const claims = JSON.parse(Buffer.from(accessToken.split('.')[1]!, 'base64url').toString());
    expect(claims.email).toBe('');
    expect(claims.phone).toBe(TEST_PHONE);
  });

  it('authenticates against our API and bootstraps a users row', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get('/auth/me')
      .set('authorization', `Bearer ${accessToken}`);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toMatchObject({ role: 'RENTER', kycStatus: 'NONE' });

    const row = await fixtureDb.user.findUniqueOrThrow({ where: { authUserId } });
    expect(row.id).toBe(response.body.id);
    // Normalised to one shape, so a lookup by phone cannot miss a real row.
    expect(row.phone).toBe(`+${TEST_PHONE}`);
    // NOT the empty string Supabase sent.
    expect(row.email).toBeNull();
    expect(row.fullName).toBe(`+${TEST_PHONE}`);
  });

  it('is rejected once tampered with, even though the rest of it is genuine', async (ctx) => {
    needsSupabase(ctx);
    const response = await request(api.server)
      .get('/auth/me')
      .set('authorization', `Bearer ${tamper(accessToken)}`);

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('refuses the wrong OTP code without saying whether the number is known', async (ctx) => {
    needsSupabase(ctx);
    const wrongCode = await request(api.server)
      .post('/auth/otp/verify')
      .send({ phone: TEST_PHONE, token: '000000' });

    const unknownNumber = await request(api.server)
      .post('/auth/otp/verify')
      .send({ phone: '919800000009', token: '123456' });

    expect(wrongCode.status).toBe(401);
    expect(unknownNumber.status).toBe(401);
    // Identical responses. Anything else turns this into a number-enumeration
    // oracle: "is this person a customer?" for the price of one request.
    expect(wrongCode.body.code).toBe(unknownNumber.body.code);
    expect(wrongCode.body.message).toBe(unknownNumber.body.message);
  });
});

/**
 * Refresh and sign-out go through the API for the same reason send does: a
 * browser that can refresh its own session needs the anon key, and a browser
 * holding the anon key can POST /auth/v1/otp directly — which routes straight
 * past OtpThrottleGuard and makes the per-phone limit decoration.
 */
describe('the session lifecycle never leaves the API', () => {
  it('exchanges a refresh token for a new session, and rotates the old one', async (ctx) => {
    needsSupabase(ctx);

    const refreshed = await request(api.server)
      .post('/auth/refresh')
      .send({ refreshToken });

    expect(refreshed.status, JSON.stringify(refreshed.body)).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeTruthy();
    expect(refreshed.body.refreshToken).not.toBe(refreshToken);

    // The new access token works on a protected route.
    const me = await request(api.server)
      .get('/auth/me')
      .set('authorization', `Bearer ${refreshed.body.accessToken}`);
    expect(me.status).toBe(200);

    // The spent token is NOT instantly dead: supabase/config.toml sets
    // refresh_token_reuse_interval = 10, a grace window that exists so a
    // dropped response or a double-fired request does not sign somebody out.
    // Asserted, so shortening that window is a visible decision rather than a
    // surprise — outside it, two parallel refreshes DO kill each other, which
    // is why the web client single-flights them.
    const replayed = await request(api.server).post('/auth/refresh').send({ refreshToken });
    expect(replayed.status).toBe(200);

    refreshToken = refreshed.body.refreshToken;
    accessToken = refreshed.body.accessToken;
  });

  it('refuses a refresh token that was never issued', async (ctx) => {
    needsSupabase(ctx);

    const response = await request(api.server)
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-refresh-token' });

    expect(response.status).toBe(401);
  });

  it('validates the body rather than handing junk upstream', async (ctx) => {
    needsSupabase(ctx);

    const response = await request(api.server).post('/auth/refresh').send({ refreshToken: '' });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('revokes at Supabase on sign-out, not just in the browser', async (ctx) => {
    needsSupabase(ctx);

    const out = await request(api.server)
      .post('/auth/signout')
      .set('authorization', `Bearer ${accessToken}`);
    expect(out.status).toBe(204);

    // Dropping the tokens client-side would leave this working for its full
    // lifetime — which is what "sign out" on a shared laptop has to prevent.
    const afterSignOut = await request(api.server).post('/auth/refresh').send({ refreshToken });
    expect(afterSignOut.status).toBe(401);
  });

  it('requires a token to sign out', async (ctx) => {
    needsSupabase(ctx);

    expect((await request(api.server).post('/auth/signout')).status).toBe(401);
  });
});
