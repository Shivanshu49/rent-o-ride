/**
 * The guards, tested as PROPERTIES rather than as wiring.
 *
 * The headline case is the first one: a controller with no decorator of any
 * kind returns 401. That is the entire reason JwtAuthGuard is registered
 * globally instead of per-route — a route someone forgot to protect has to fail
 * CLOSED. Asserting `APP_GUARD` appears in a providers array would pass just as
 * happily with the guard registered in a module nothing imports; mounting an
 * undecorated route and watching it refuse anonymous traffic would not.
 */
import { Controller, Get } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { AuthActor } from '../src/common/types/actor';
import { CurrentUser } from '../src/modules/auth/decorators/current-user.decorator';
import { Public } from '../src/modules/auth/decorators/public.decorator';
import { RequiresKyc } from '../src/modules/auth/decorators/kyc.decorator';
import { Roles } from '../src/modules/auth/decorators/roles.decorator';
import { algNoneToken, createTestApi, dropUsers, seedUser, tamper, type TestApi } from './support/api';

@Controller('__probe')
class ProbeController {
  /**
   * NO decorator. Not @Public, not @Roles, not @UseGuards. This is the route a
   * developer ships when they forget, and the one the whole design is about.
   */
  @Get('undecorated')
  undecorated(): { reached: true } {
    return { reached: true };
  }

  @Public()
  @Get('opted-out')
  optedOut(): { reached: true } {
    return { reached: true };
  }

  @Get('who-am-i')
  whoAmI(@CurrentUser() actor: AuthActor): AuthActor {
    return actor;
  }

  @Roles('OWNER')
  @Get('owner-only')
  ownerOnly(): { reached: true } {
    return { reached: true };
  }

  @RequiresKyc()
  @Get('needs-kyc')
  needsKyc(): { reached: true } {
    return { reached: true };
  }
}

let api: TestApi;
const planted: string[] = [];

const bearer = (token: string): [string, string] => ['authorization', `Bearer ${token}`];

beforeAll(async () => {
  api = await createTestApi([ProbeController]);
});

afterAll(async () => {
  await dropUsers(planted);
  await api.close();
});

describe('the global guard fails closed', () => {
  it('refuses an UNDECORATED route with 401', async () => {
    const response = await request(api.server).get('/__probe/undecorated');

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
  });

  it('serves that same undecorated route once a token is presented', async () => {
    // Without this the test above proves nothing: a 404 from a route that was
    // never mounted is also "not 200". This pins it as a real, reachable route
    // that the guard — and only the guard — closed.
    const sub = crypto.randomUUID();
    planted.push(sub);

    const response = await request(api.server)
      .get('/__probe/undecorated')
      .set(...bearer(await api.mint({ sub, phone: '+919811000001' })));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reached: true });
  });

  it('opens a route only where @Public() says so', async () => {
    const response = await request(api.server).get('/__probe/opted-out');
    expect(response.status).toBe(200);
  });

  it('refuses a malformed Authorization header the same as none at all', async () => {
    for (const header of ['', 'Bearer', 'Bearer ', 'Basic abc', 'token abc']) {
      const response = await request(api.server).get('/__probe/undecorated').set('authorization', header);
      expect(response.status, `header: "${header}"`).toBe(401);
    }
  });
});

describe('token verification', () => {
  it('rejects a tampered signature', async () => {
    const token = await api.mint({ sub: crypto.randomUUID() });

    const response = await request(api.server)
      .get('/__probe/who-am-i')
      .set(...bearer(tamper(token)));

    expect(response.status).toBe(401);
    expect(response.body.code).toBe('UNAUTHENTICATED');
    // The reason must NOT reach the client: "bad signature" vs "expired" tells
    // a forger which half of the attempt worked.
    expect(JSON.stringify(response.body)).not.toMatch(/signature|verif/i);
  });

  it('rejects an expired token', async () => {
    const response = await request(api.server)
      .get('/__probe/who-am-i')
      .set(...bearer(await api.mint({ expiresInSeconds: -120 })));

    expect(response.status).toBe(401);
  });

  it('rejects a token minted for another audience', async () => {
    const response = await request(api.server)
      .get('/__probe/who-am-i')
      .set(...bearer(await api.mint({ audience: 'some-other-service' })));

    expect(response.status).toBe(401);
  });

  it('rejects a token from another issuer', async () => {
    const response = await request(api.server)
      .get('/__probe/who-am-i')
      .set(...bearer(await api.mint({ issuer: 'https://evil.example.com/auth/v1' })));

    expect(response.status).toBe(401);
  });

  it('rejects an alg:none token', async () => {
    const response = await request(api.server)
      .get('/__probe/who-am-i')
      .set(...bearer(algNoneToken(crypto.randomUUID(), api.issuer, api.audience)));

    expect(response.status).toBe(401);
  });

  it('leaves a bad token on a @Public() route anonymous rather than fatal', async () => {
    // Browsing must not break because a stale token is sitting in localStorage.
    const response = await request(api.server)
      .get('/__probe/opted-out')
      .set(...bearer(tamper(await api.mint({}))));

    expect(response.status).toBe(200);
  });
});

describe('RolesGuard', () => {
  it('refuses the wrong role with 403', async () => {
    const renter = await seedUser({ role: 'RENTER' });
    planted.push(renter.authUserId);

    const response = await request(api.server)
      .get('/__probe/owner-only')
      .set(...bearer(await api.mint({ sub: renter.authUserId })));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('FORBIDDEN');
  });

  it('admits the right role', async () => {
    const owner = await seedUser({ role: 'OWNER' });
    planted.push(owner.authUserId);

    const response = await request(api.server)
      .get('/__probe/owner-only')
      .set(...bearer(await api.mint({ sub: owner.authUserId })));

    expect(response.status).toBe(200);
  });

  it('does NOT treat ADMIN as implicitly every role', async () => {
    // RolesGuard claims this in a comment. An admin acting as an owner has to
    // go through an admin route that leaves an audit trail.
    const admin = await seedUser({ role: 'ADMIN' });
    planted.push(admin.authUserId);

    const response = await request(api.server)
      .get('/__probe/owner-only')
      .set(...bearer(await api.mint({ sub: admin.authUserId })));

    expect(response.status).toBe(403);
  });
});

describe('KycGuard', () => {
  it('refuses an unverified caller with KYC_REQUIRED, not a bare 403', async () => {
    const renter = await seedUser({ kycStatus: 'NONE' });
    planted.push(renter.authUserId);

    const response = await request(api.server)
      .get('/__probe/needs-kyc')
      .set(...bearer(await api.mint({ sub: renter.authUserId })));

    expect(response.status).toBe(403);
    // The client turns this exact code into the upload flow. A generic
    // FORBIDDEN would leave the user with nothing to do next.
    expect(response.body.code).toBe('KYC_REQUIRED');
    expect(response.body.details).toMatchObject({ kycStatus: 'NONE' });
  });

  it.each(['PENDING', 'REJECTED'] as const)('refuses kycStatus=%s too', async (status) => {
    const renter = await seedUser({ kycStatus: status });
    planted.push(renter.authUserId);

    const response = await request(api.server)
      .get('/__probe/needs-kyc')
      .set(...bearer(await api.mint({ sub: renter.authUserId })));

    expect(response.status).toBe(403);
    expect(response.body.code).toBe('KYC_REQUIRED');
  });

  it('admits a VERIFIED caller', async () => {
    const renter = await seedUser({ kycStatus: 'VERIFIED' });
    planted.push(renter.authUserId);

    const response = await request(api.server)
      .get('/__probe/needs-kyc')
      .set(...bearer(await api.mint({ sub: renter.authUserId })));

    expect(response.status).toBe(200);
  });
});
