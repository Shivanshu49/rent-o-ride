/**
 * Boots the real application for an e2e test, and mints tokens for it.
 *
 * Nothing here replaces TokenVerifier or any guard. The tokens are genuine
 * ES256 JWTs and go through the same `jwtVerify` call, the same issuer,
 * audience and expiry checks, and the same JWKS resolution as a token Supabase
 * issued — only the key set is one this process generated, so a test can mint
 * an expired or wrongly-audienced token on demand instead of waiting an hour or
 * standing up a second Supabase project.
 *
 * The other half of that claim is tested separately: `supabase-tokens.e2e-spec.ts`
 * runs the same routes against tokens a REAL Supabase Auth issued, fetched over
 * its real JWKS endpoint. Between the two, both the crypto path and the
 * Supabase-compatibility path are covered by something that would actually fail.
 */
import { randomUUID } from 'node:crypto';
import type { Type } from '@nestjs/common';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { PrismaPg } from '@prisma/adapter-pg';
import { type KycStatus, PrismaClient, type UserRole } from '@prisma/client';
import { type JWK, SignJWT, exportJWK, generateKeyPair } from 'jose';
import type { TestContext } from 'vitest';
import { AllExceptionsFilter } from '../../src/common/filters/all-exceptions.filter';
import { AppConfig } from '../../src/config/config.module';
import { AppModule } from '../../src/app.module';
import { TokenVerifier } from '../../src/modules/auth/token-verifier';

const TEST_KID = 'ror-test-key';

export interface MintOptions {
  /** Supabase auth.users.id. A fresh uuid means a user that does not exist yet. */
  sub?: string;
  phone?: string;
  email?: string;
  issuer?: string;
  audience?: string;
  /** Seconds from now. Negative mints an already-expired token. */
  expiresInSeconds?: number;
  userMetadata?: Record<string, unknown>;
}

export interface TestApi {
  app: NestFastifyApplication;
  server: ReturnType<NestFastifyApplication['getHttpServer']>;
  config: AppConfig;
  issuer: string;
  audience: string;
  mint(options?: MintOptions): Promise<string>;
  close(): Promise<void>;
}

export interface TestApiOptions {
  /**
   * Leave TokenVerifier pointed at the REAL Supabase JWKS endpoint instead of
   * the generated test key set. Used by `supabase-tokens.e2e-spec.ts`, where
   * the tokens come from a real Supabase and `mint()` is not used.
   */
  useRealJwks?: boolean;
}

/** `controllers` are mounted at the root of the testing module, so the globally
 *  registered guards apply to them exactly as they do to a real controller. */
export async function createTestApi(
  controllers: Type<unknown>[] = [],
  options: TestApiOptions = {},
): Promise<TestApi> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule], controllers }).compile();

  const app = moduleRef.createNestApplication<NestFastifyApplication>(
    // trustProxy so a test can present a different client IP and prove the OTP
    // limit does not reset with it.
    new FastifyAdapter({ trustProxy: true }),
    // Nest's own Logger does not go through pino here, so LOG_LEVEL cannot
    // quieten it. A filter logging a deliberately-provoked 5xx would otherwise
    // bury the assertion that failed.
    { logger: false },
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  await app.getHttpAdapter().getInstance().ready();

  const { publicKey, privateKey } = await generateKeyPair('ES256', { extractable: true });
  const jwk: JWK = { ...(await exportJWK(publicKey)), kid: TEST_KID, alg: 'ES256', use: 'sig' };
  if (!options.useRealJwks) app.get(TokenVerifier).useLocalJwks({ keys: [jwk] });

  const config = app.get(AppConfig);
  const issuer =
    config.get('SUPABASE_JWT_ISSUER') ?? `${config.get('SUPABASE_URL').replace(/\/$/, '')}/auth/v1`;
  const audience = config.get('SUPABASE_JWT_AUDIENCE');

  return {
    app,
    server: app.getHttpServer(),
    config,
    issuer,
    audience,
    async mint(options: MintOptions = {}) {
      const now = Math.floor(Date.now() / 1000);
      return new SignJWT({
        // Shaped like a real Supabase phone-OTP token, empty strings and all.
        email: options.email ?? '',
        phone: options.phone ?? '',
        role: 'authenticated',
        app_metadata: { provider: 'phone', providers: ['phone'] },
        user_metadata: options.userMetadata ?? {},
      })
        .setProtectedHeader({ alg: 'ES256', kid: TEST_KID })
        .setSubject(options.sub ?? randomUUID())
        .setIssuer(options.issuer ?? issuer)
        .setAudience(options.audience ?? audience)
        .setIssuedAt(now)
        .setExpirationTime(now + (options.expiresInSeconds ?? 600))
        .sign(privateKey);
    },
    close: () => app.close(),
  };
}

/**
 * Flip one character of the signature and leave the rest of the token intact,
 * so a rejection can only have come from the signature check.
 */
export function tamper(token: string): string {
  const [header, payload, signature] = token.split('.');
  const flipped = (signature![0] === 'A' ? 'B' : 'A') + signature!.slice(1);
  return `${header}.${payload}.${flipped}`;
}

/** The `alg: "none"` forgery. Any verifier that honours the header instead of
 *  its own configured algorithm accepts this for any subject. */
export function algNoneToken(sub: string, issuer: string, audience: string): string {
  const part = (value: object): string => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = { sub, iss: issuer, aud: audience, exp: Math.floor(Date.now() / 1000) + 600 };
  return `${part({ alg: 'none', typ: 'JWT' })}.${part(claims)}.`;
}

// ---------------------------------------------------------------- fixtures

/** Owner connection. Fixtures set up state the app under test then reads
 *  through its own, RLS-bound, connection. */
export const fixtureDb = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DIRECT_URL']! }),
});

let sequence = 0;
export const uniquePhone = (): string =>
  `+9177${String(Date.now()).slice(-7)}${String(sequence++).padStart(3, '0')}`;

export async function seedUser(
  overrides: { authUserId?: string; role?: UserRole; kycStatus?: KycStatus } = {},
): Promise<{ id: string; authUserId: string }> {
  const user = await fixtureDb.user.create({
    data: {
      authUserId: overrides.authUserId ?? randomUUID(),
      fullName: 'Fixture User',
      phone: uniquePhone(),
      role: overrides.role ?? 'RENTER',
      kycStatus: overrides.kycStatus ?? 'NONE',
    },
    select: { id: true, authUserId: true },
  });
  return user;
}

export async function dropUsers(authUserIds: readonly (string | undefined)[]): Promise<void> {
  // Filtered, because a beforeAll that failed part-way leaves holes in the list
  // and the resulting Prisma validation error buries the real failure.
  const ids = authUserIds.filter((id): id is string => typeof id === 'string');
  if (ids.length === 0) return;
  await fixtureDb.user.deleteMany({ where: { authUserId: { in: ids } } });
}

// ------------------------------------------------- the Supabase-only suites

let supabaseUp = false;

/** Call once in `beforeAll`. Two suites need Auth or Storage for real; the rest
 *  of the suite needs only Postgres and Redis and must keep running without it. */
export async function probeSupabase(): Promise<boolean> {
  const url = (process.env['SUPABASE_URL'] ?? '').replace(/\/$/, '');
  supabaseUp = await fetch(`${url}/auth/v1/health`)
    .then((response) => response.ok)
    .catch(() => false);
  return supabaseUp;
}

/** Skipped by name rather than silently passing, so "green" never means
 *  "nothing ran". */
export function needsSupabase(ctx: TestContext): void {
  if (!supabaseUp) {
    ctx.skip(`no Supabase at ${process.env['SUPABASE_URL']} — run: npm run supabase:start`);
  }
}
