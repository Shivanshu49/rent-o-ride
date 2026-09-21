import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { type SupabaseClient, createClient } from '@supabase/supabase-js';
import { ApiError } from '../../common/errors';
import { AppConfig } from '../../config/config.module';
import { normalisePhone } from './guards/otp-throttle.guard';

/**
 * Proxies the WHOLE Supabase Auth handshake: send, verify, refresh, sign out.
 *
 * Supabase owns delivery — it has the SMS provider relationship and the
 * templates. We own the rate limit, because the cost and the abuse land on us,
 * and because Supabase's own limits are per-project rather than per-number.
 *
 * The OtpThrottleGuard runs BEFORE this service, so a blocked request never
 * reaches the provider and never costs an SMS.
 *
 * REFRESH lives here for the same reason SEND does. If the browser refreshed
 * its own session it would need the anon key, and a browser holding the anon
 * key can call /auth/v1/otp directly — at which point our per-phone limit is
 * decoration and the SMS bill is whatever an attacker feels like. The anon key
 * never leaves this process, which is what makes the throttle unavoidable
 * rather than merely present.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  private readonly client: SupabaseClient;

  constructor(private readonly config: AppConfig) {
    this.client = createClient(this.config.get('SUPABASE_URL'), this.config.get('SUPABASE_ANON_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async sendOtp(rawPhone: string): Promise<{ sent: true }> {
    const phone = normalisePhone(rawPhone);
    if (!phone) throw ApiError.unprocessable('VALIDATION_FAILED', 'Enter a valid phone number');

    const { error } = await this.client.auth.signInWithOtp({ phone });
    if (error) {
      this.logger.warn({ phoneSuffix: phone.slice(-4), status: error.status, err: error.message }, 'OTP send failed');
      // Supabase has a per-number send frequency of its own, on top of ours.
      // Passing that through as 502 tells the user "we are broken" when the
      // truth is "wait a moment" — and the client would retry instead of
      // showing a countdown. Keep the meaning, not just the failure.
      if (error.status === 429) {
        throw new ApiError('RATE_LIMITED', HttpStatus.TOO_MANY_REQUESTS, 'Wait a moment before requesting another code');
      }
      throw new ApiError('UPSTREAM_UNAVAILABLE', HttpStatus.BAD_GATEWAY, 'Could not send the verification code');
    }
    return { sent: true };
  }

  /**
   * Exchanges a refresh token for a new session.
   *
   * Rotating: Supabase issues a new refresh token and retires the old one, so a
   * stolen token stops working once the real client has refreshed. A short
   * reuse window (refresh_token_reuse_interval in supabase/config.toml) keeps a
   * retried or duplicated request from signing somebody out; beyond it the old
   * token is gone, which is why the web client single-flights refresh rather
   * than relying on landing inside the window.
   */
  async refresh(refreshToken: string): Promise<Session> {
    const { data, error } = await this.client.auth.refreshSession({ refresh_token: refreshToken });
    if (error || !data.session) {
      // Expired, already rotated, or revoked by a sign-out. All of them mean
      // the same thing to the caller: sign in again.
      throw new ApiError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Your session has expired');
    }
    return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
  }

  /**
   * Revokes the session at Supabase, not just in the browser.
   *
   * Dropping the tokens client-side leaves the refresh token valid for its full
   * lifetime, so "sign out" on a shared laptop would mean nothing to anyone who
   * had already copied it. supabase-js used to do this from the browser; with
   * the key gone from the bundle, the API does it.
   */
  async signOut(accessToken: string): Promise<void> {
    const response = await fetch(`${this.config.get('SUPABASE_URL').replace(/\/$/, '')}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        apikey: this.config.get('SUPABASE_ANON_KEY'),
        authorization: `Bearer ${accessToken}`,
      },
    });
    // A failed revocation must not stop the client clearing its own state —
    // the user asked to be signed out and half of that always works. It does
    // need to be visible, because the other half is a live session.
    if (!response.ok) {
      this.logger.warn({ status: response.status }, 'Supabase did not revoke the session');
    }
  }

  /** Exchanges the code for a Supabase session. Every subsequent request to
   *  this API carries that session's access token. */
  async verifyOtp(rawPhone: string, token: string): Promise<Session> {
    const phone = normalisePhone(rawPhone);
    if (!phone) throw ApiError.unprocessable('VALIDATION_FAILED', 'Enter a valid phone number');

    const { data, error } = await this.client.auth.verifyOtp({ phone, token, type: 'sms' });
    if (error || !data.session) {
      // Same response whether the number is unknown or the code is wrong.
      // Distinguishing them turns this endpoint into a number-enumeration oracle.
      throw new ApiError('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'That code is not valid');
    }
    return { accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
  }
}

export interface Session {
  accessToken: string;
  refreshToken: string;
}
