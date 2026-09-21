import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { type JWTPayload, createLocalJWKSet, createRemoteJWKSet, jwtVerify } from 'jose';
import { AppConfig } from '../../config/config.module';

/** The claims we rely on. Supabase sends more; we verify and use these. */
export interface SupabaseClaims extends JWTPayload {
  sub: string;
  email?: string;
  phone?: string;
  role?: string;
}

export class TokenVerificationError extends Error {
  override readonly name = 'TokenVerificationError';
}

/**
 * Verifies Supabase-issued access tokens.
 *
 * Two strategies, because Supabase has two:
 *
 *   jwks  — ES256, asymmetric. The public half is published at
 *           /auth/v1/.well-known/jwks.json and jose caches it, refetching on an
 *           unknown `kid` so a key rotation does not need a redeploy. We hold no
 *           signing key at all, which is the point: our environment leaking
 *           cannot be used to mint a token for someone else.
 *
 *   hs256 — the legacy shared secret. Symmetric, so the same value that
 *           verifies a token also signs one. Supported for older projects.
 *
 * iss, aud and exp are all verified. Skipping `aud` is the classic mistake: a
 * Supabase project issues tokens for several audiences, and a token minted for
 * one of them would otherwise be accepted here.
 */
@Injectable()
export class TokenVerifier implements OnModuleInit {
  private readonly logger = new Logger(TokenVerifier.name);
  private keyResolver!: Parameters<typeof jwtVerify>[1];
  private issuer!: string;
  private audience!: string;

  constructor(private readonly config: AppConfig) {}

  onModuleInit(): void {
    const supabaseUrl = this.config.get('SUPABASE_URL').replace(/\/$/, '');
    this.issuer = this.config.get('SUPABASE_JWT_ISSUER') ?? `${supabaseUrl}/auth/v1`;
    this.audience = this.config.get('SUPABASE_JWT_AUDIENCE');

    const strategy = this.config.get('SUPABASE_JWT_STRATEGY');
    if (strategy === 'hs256') {
      const secret = this.config.get('SUPABASE_JWT_SECRET');
      // Config validation guarantees this, but an assertion here means a future
      // refactor of the env schema cannot quietly produce an undefined key.
      if (!secret) throw new Error('SUPABASE_JWT_SECRET is required for the hs256 strategy');
      const key = new TextEncoder().encode(secret);
      this.keyResolver = () => Promise.resolve(key);
      this.logger.warn('verifying tokens with a shared secret (hs256) — prefer jwks');
    } else {
      this.keyResolver = createRemoteJWKSet(new URL(`${this.issuer}/.well-known/jwks.json`), {
        cooldownDuration: 30_000,
        cacheMaxAge: 10 * 60_000,
      });
      this.logger.log(`verifying tokens against ${this.issuer}/.well-known/jwks.json (jwks)`);
    }
  }

  async verify(token: string): Promise<SupabaseClaims> {
    try {
      const { payload } = await jwtVerify(token, this.keyResolver, {
        issuer: this.issuer,
        audience: this.audience,
        clockTolerance: 5,
      });

      if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
        throw new TokenVerificationError('token has no subject');
      }
      return payload as SupabaseClaims;
    } catch (error) {
      // The reason never reaches the client — "expired" vs "bad signature" tells
      // an attacker which half of a forgery attempt worked. It goes to the log.
      throw new TokenVerificationError((error as Error).message);
    }
  }

  /** Test seam: lets the e2e suite verify against a fixed JWK set. */
  useLocalJwks(jwks: Parameters<typeof createLocalJWKSet>[0]): void {
    this.keyResolver = createLocalJWKSet(jwks);
  }
}
