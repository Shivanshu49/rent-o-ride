import { z } from 'zod';

/**
 * Every environment variable the API needs, validated at boot.
 * The app REFUSES to start on a missing or malformed var and names it —
 * a process that boots with a half-configured payment secret is worse than
 * one that does not boot at all.
 */
/**
 * `z.string().url()` accepts "localhost:5433": WHATWG parses it as scheme
 * "localhost:" with path "5433". That passes validation and then fails at
 * connect time, which is exactly the boot-time failure this module exists to
 * prevent. So every connection string also has to name a scheme we can dial.
 */
const connectionUrl = (...schemes: readonly string[]) =>
  z
    .string()
    .url()
    .refine((value) => schemes.some((s) => value.startsWith(`${s}://`)), {
      message: `must start with ${schemes.map((s) => `${s}://`).join(' or ')}`,
    });

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  WEB_ORIGIN: connectionUrl('http', 'https'),

  /** Pooled connection used by the app role — RLS applies to it. */
  DATABASE_URL: connectionUrl('postgresql', 'postgres'),
  /** Unpooled connection for migrations and the admin client. */
  DIRECT_URL: connectionUrl('postgresql', 'postgres'),
  REDIS_URL: connectionUrl('redis', 'rediss'),

  SUPABASE_URL: connectionUrl('http', 'https'),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /** HS256 shared secret. Unused when SUPABASE_JWT_STRATEGY=jwks. */
  SUPABASE_JWT_SECRET: z.string().min(1),
  SUPABASE_JWT_STRATEGY: z.enum(['hs256', 'jwks']).default('hs256'),

  RAZORPAY_KEY_ID: z.string().min(1),
  RAZORPAY_KEY_SECRET: z.string().min(1),
  RAZORPAY_WEBHOOK_SECRET: z.string().min(1),

  /** HMAC key for price quote tokens. Rotating this invalidates live quotes —
   *  see docs/RUNBOOK.md for the dual-key rotation procedure. */
  QUOTE_SIGNING_SECRET: z.string().min(32, 'QUOTE_SIGNING_SECRET must be >= 32 chars'),

  /** false falls back to the Haversine search path (Appendix E). */
  USE_POSTGIS: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  SWAGGER_USER: z.string().default('admin'),
  SWAGGER_PASSWORD: z.string().default(''),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
