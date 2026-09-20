import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema';

const VALID = {
  NODE_ENV: 'test',
  PORT: '3000',
  WEB_ORIGIN: 'http://localhost:5173',
  DATABASE_URL: 'postgresql://app_role:app_role@localhost:5433/rentoride',
  DIRECT_URL: 'postgresql://postgres:postgres@localhost:5433/rentoride',
  REDIS_URL: 'redis://localhost:6380',
  SUPABASE_URL: 'http://localhost:54321',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  SUPABASE_JWT_SECRET: 'jwt-secret-at-least-32-characters-long-ok',
  RAZORPAY_KEY_ID: 'rzp_test_x',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'webhook',
  QUOTE_SIGNING_SECRET: 'quote-signing-secret-at-least-32-chars',
};

describe('validateEnv', () => {
  it('accepts a complete environment and coerces types', () => {
    const env = validateEnv(VALID);
    expect(env.PORT).toBe(3000);
    expect(env.USE_POSTGIS).toBe(true);
    expect(env.NODE_ENV).toBe('test');
  });

  it('refuses to boot on a missing var, and names it', () => {
    const { QUOTE_SIGNING_SECRET: _omitted, ...missing } = VALID;
    expect(() => validateEnv(missing)).toThrow(/QUOTE_SIGNING_SECRET/);
  });

  it('refuses a quote signing secret short enough to brute force', () => {
    expect(() => validateEnv({ ...VALID, QUOTE_SIGNING_SECRET: 'short' })).toThrow(
      /QUOTE_SIGNING_SECRET must be >= 32 chars/,
    );
  });

  it('refuses a malformed URL rather than failing later at connect time', () => {
    expect(() => validateEnv({ ...VALID, DATABASE_URL: 'localhost:5433' })).toThrow(/DATABASE_URL/);
  });

  it('names every problem at once, so one boot attempt fixes them all', () => {
    const broken = { ...VALID, WEB_ORIGIN: 'not-a-url', REDIS_URL: 'nope' };
    expect(() => validateEnv(broken)).toThrow(/WEB_ORIGIN[\s\S]*REDIS_URL/);
  });

  it('treats USE_POSTGIS=false as the Haversine fallback, not a truthy string', () => {
    expect(validateEnv({ ...VALID, USE_POSTGIS: 'false' }).USE_POSTGIS).toBe(false);
  });
});
