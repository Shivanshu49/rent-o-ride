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
  /** Used by `prisma migrate dev` only. Never opened by the running API. */
  SHADOW_DATABASE_URL: connectionUrl('postgresql', 'postgres').optional(),
  REDIS_URL: connectionUrl('redis', 'rediss'),

  SUPABASE_URL: connectionUrl('http', 'https'),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  /**
   * How we verify Supabase's tokens.
   *
   * 'jwks' is the default because it is what Supabase actually issues now:
   * ES256, signed by a rotating key, with the public half published at
   * /auth/v1/.well-known/jwks.json. We never hold the private key, so a leak of
   * our environment cannot be used to mint tokens.
   *
   * 'hs256' is the legacy shared-secret mode. It is symmetric — the same secret
   * verifies AND signs — so anything holding it can forge a token for any user.
   * Supported because older projects still use it, not because it is a good idea.
   */
  SUPABASE_JWT_STRATEGY: z.enum(['hs256', 'jwks']).default('jwks'),
  /** Required only when SUPABASE_JWT_STRATEGY=hs256. */
  SUPABASE_JWT_SECRET: z.string().min(1).optional(),
  /** Supabase sets this to <SUPABASE_URL>/auth/v1. Verified on every token. */
  SUPABASE_JWT_ISSUER: z.string().min(1).optional(),
  SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),

  /** OTP requests allowed per phone number per hour. */
  OTP_MAX_PER_HOUR: z.coerce.number().int().positive().default(5),
  /** TTL of a KYC document read URL, in seconds. Short on purpose. */
  KYC_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().positive().default(60),

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

const envSchemaChecked = envSchema.superRefine((env, ctx) => {
  // A boot that "succeeds" into hs256 mode with no secret would accept nothing
  // and reject every user, which looks like an auth outage rather than a
  // misconfiguration. Fail here instead, naming the missing variable.
  if (env.SUPABASE_JWT_STRATEGY === 'hs256' && !env.SUPABASE_JWT_SECRET) {
    ctx.addIssue({
      code: 'custom',
      path: ['SUPABASE_JWT_SECRET'],
      message: 'is required when SUPABASE_JWT_STRATEGY=hs256',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchemaChecked.safeParse(raw);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
