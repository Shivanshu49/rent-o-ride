import { type CanActivate, type ExecutionContext, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Redis } from 'ioredis';
import { ApiError } from '../../../common/errors';
import { AppConfig } from '../../../config/config.module';
import { REDIS } from '../../../redis/redis.module';

export const OTP_WINDOW_SECONDS = 3600;

/**
 * Caps OTP requests per PHONE NUMBER, not per IP.
 *
 * Per-IP is the wrong key here in both directions. It under-blocks, because one
 * attacker enumerating codes rotates IPs trivially and each new address gets a
 * fresh budget. And it over-blocks, because every user behind one mobile
 * carrier NAT or one office egress shares an address — so a handful of
 * legitimate sign-ins locks out a whole building.
 *
 * The thing we are actually protecting is the phone number: the SMS costs money
 * to send, and the person receiving it did not ask to be woken up.
 *
 * ponytail: fixed window, so a caller timing requests across a boundary gets up
 * to 2x the limit in one burst. A sliding window (sorted set of timestamps)
 * fixes that if abuse shows up; for "stop accidental resend storms and make SMS
 * enumeration expensive" the fixed window is enough and costs one INCR.
 */
@Injectable()
export class OtpThrottleGuard implements CanActivate {
  private readonly logger = new Logger(OtpThrottleGuard.name);

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: AppConfig,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const http = context.switchToHttp();
    const request = http.getRequest<FastifyRequest<{ Body?: { phone?: string } }>>();

    const phone = normalisePhone(request.body?.phone);
    // No phone in the body is a validation problem, not a throttling one. Let
    // the pipe produce the useful error instead of a confusing 429.
    if (!phone) return true;

    const key = `otp:phone:${phone}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, OTP_WINDOW_SECONDS);

    const max = this.config.get('OTP_MAX_PER_HOUR');
    if (count > max) {
      const ttl = await this.redis.ttl(key);
      const retryAfter = ttl > 0 ? ttl : OTP_WINDOW_SECONDS;

      // Log the last 4 digits only. A log aggregator holding a list of every
      // phone number that tried to sign in is a privacy problem of its own.
      this.logger.warn(
        { phoneSuffix: phone.slice(-4), count, retryAfter },
        'OTP rate limit exceeded',
      );

      void http.getResponse<FastifyReply>().header('retry-after', String(retryAfter));
      throw new ApiError(
        'RATE_LIMITED',
        HttpStatus.TOO_MANY_REQUESTS,
        'Too many verification codes requested. Try again later.',
        { retryAfterSeconds: retryAfter },
      );
    }

    return true;
  }
}

/** One shape per number, so "+91 98110 42301" and "919811042301" share a
 *  budget. Without this the limit is trivially bypassed by adding a space. */
export function normalisePhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  return digits.length >= 8 ? `+${digits}` : null;
}
