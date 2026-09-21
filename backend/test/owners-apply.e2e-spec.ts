/**
 * Applying to list vehicles.
 *
 * The important negative: applying does NOT verify you, and nothing reachable
 * from a user request can. `owner_profiles_admin_write` is the only UPDATE
 * policy on the table, so even a bug in this service cannot flip is_verified —
 * which is the whole reason the check lives in the database and not in a
 * service method somebody could later "simplify".
 */
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApi, dropUsers, fixtureDb, seedUser, type TestApi } from './support/api';

let api: TestApi;
const planted: string[] = [];

const bearer = (token: string): [string, string] => ['authorization', `Bearer ${token}`];

const applicant = async (): Promise<{ token: string; id: string }> => {
  const user = await seedUser();
  planted.push(user.authUserId);
  return { token: await api.mint({ sub: user.authUserId }), id: user.id };
};

beforeAll(async () => {
  api = await createTestApi();
});

afterAll(async () => {
  await dropUsers(planted);
  await api.close();
  await fixtureDb.$disconnect();
});

describe('POST /owners/apply', () => {
  it('creates an UNVERIFIED profile at the default commission', async () => {
    const { token, id } = await applicant();

    const response = await request(api.server)
      .post('/owners/apply')
      .set(...bearer(token))
      .send({});

    expect(response.status).toBe(201);
    expect(response.body).toMatchObject({
      userId: id,
      isVerified: false,
      commissionBps: 1800,
      reliability: 100,
    });
  });

  it('is idempotent — a double-tapped button is not an error', async () => {
    const { token } = await applicant();

    const first = await request(api.server).post('/owners/apply').set(...bearer(token)).send({});
    const second = await request(api.server).post('/owners/apply').set(...bearer(token)).send({});

    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
  });

  it('refuses an anonymous application', async () => {
    const response = await request(api.server).post('/owners/apply').send({});
    expect(response.status).toBe(401);
  });

  it('rejects a payout reference that is not a reference', async () => {
    const { token } = await applicant();

    const response = await request(api.server)
      .post('/owners/apply')
      .set(...bearer(token))
      .send({ payoutAccountRef: 'x' });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
  });

  it('ignores an is_verified the client tried to send', async () => {
    // Zod strips unknown keys. Without that, self-verification is one curl away.
    const { token, id } = await applicant();

    const response = await request(api.server)
      .post('/owners/apply')
      .set(...bearer(token))
      .send({ isVerified: true, commissionBps: 0 });

    expect(response.body.isVerified).toBe(false);
    expect(response.body.commissionBps).toBe(1800);

    const row = await fixtureDb.ownerProfile.findUniqueOrThrow({ where: { userId: id } });
    expect(row.isVerified).toBe(false);
    expect(row.commissionBps).toBe(1800);
  });
});

describe('GET /owners/me', () => {
  it("returns the caller's own profile", async () => {
    const { token, id } = await applicant();
    await request(api.server).post('/owners/apply').set(...bearer(token)).send({});

    const response = await request(api.server).get('/owners/me').set(...bearer(token));

    expect(response.status).toBe(200);
    expect(response.body.userId).toBe(id);
  });

  it('404s for someone who has not applied', async () => {
    const { token } = await applicant();

    const response = await request(api.server).get('/owners/me').set(...bearer(token));

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('NOT_FOUND');
  });

  it('never returns somebody else profile', async () => {
    const owner = await applicant();
    await request(api.server).post('/owners/apply').set(...bearer(owner.token)).send({});

    const stranger = await applicant();
    const response = await request(api.server).get('/owners/me').set(...bearer(stranger.token));

    expect(response.status).toBe(404);
  });
});
