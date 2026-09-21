/**
 * The ONLY place fetch() appears in this app.
 *
 * Everything the browser knows about the server goes through here, which buys
 * three things that are painful to retrofit once fetch is scattered across
 * forty components: the access token is attached in one place, a 401 is
 * retried after exactly one refresh in one place, and an error body becomes a
 * typed ApiError in one place. `scripts/check-boundaries.mjs` fails CI if
 * fetch( turns up anywhere else under src/.
 *
 * Every Supabase call goes through our API too, including refresh and sign-out.
 * See `session.ts` for why the anon key must not be in this bundle.
 */
import type { Actor, ApiErrorBody, ApiErrorCode, KycUploadRequestInput } from '@ror/shared';
import {
  clearSession,
  getAccessToken,
  getRefreshToken,
  setSession,
  type Session,
} from './session';

const BASE_URL: string = import.meta.env['VITE_API_URL'] ?? '/api';

export class ApiError extends Error {
  constructor(
    readonly code: ApiErrorCode,
    readonly status: number,
    message: string,
    readonly details?: unknown,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** The caller must finish KYC. The one error the UI turns into a flow rather
   *  than a message. */
  get needsKyc(): boolean {
    return this.code === 'KYC_REQUIRED';
  }

  get needsSignIn(): boolean {
    return this.code === 'UNAUTHENTICATED';
  }

  /** Seconds to wait, when the server told us. */
  get retryAfterSeconds(): number | undefined {
    const details = this.details as { retryAfterSeconds?: number } | undefined;
    return details?.retryAfterSeconds;
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  // A 502 from a proxy, or a crash before our filter runs, is not JSON. Falling
  // back keeps the UI showing a sentence instead of "Unexpected token < ".
  const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
  return new ApiError(
    body?.code ?? (response.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL'),
    response.status,
    body?.message ?? 'Something went wrong. Try again.',
    body?.details,
    body?.requestId ?? response.headers.get('x-request-id') ?? undefined,
  );
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Skip the Authorization header and the refresh-on-401 retry. Sign-in and
   *  refresh are @Public(), and refreshing a refresh would recurse. */
  anonymous?: boolean;
}

/**
 * At most one refresh in flight.
 *
 * Supabase ROTATES refresh tokens. There is a short reuse window — ten seconds,
 * set in supabase/config.toml — where the spent token still works, precisely so
 * a dropped response does not sign somebody out. Outside it the old token is
 * dead. Three requests that all 401 on a stale access token would otherwise
 * fire three refreshes and depend on landing inside that window to survive.
 * Sharing the promise means the other two wait for the same answer instead.
 */
let inFlightRefresh: Promise<boolean> | null = null;

function refreshOnce(): Promise<boolean> {
  inFlightRefresh ??= (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;
    try {
      const session = await call<Session>('/auth/refresh', {
        method: 'POST',
        body: { refreshToken },
        anonymous: true,
      });
      setSession(session);
      return true;
    } catch {
      // Expired, already rotated, or revoked. There is nothing to retry.
      clearSession();
      return false;
    } finally {
      inFlightRefresh = null;
    }
  })();
  return inFlightRefresh;
}

async function call<T>(path: string, options: CallOptions = {}, refreshed = false): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers['content-type'] = 'application/json';

  if (!options.anonymous) {
    const token = getAccessToken();
    if (token) headers['authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    // Spread rather than `body: undefined`: exactOptionalPropertyTypes draws a
    // distinction between "absent" and "present and undefined", and a GET with
    // an explicit undefined body is the latter.
    ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });

  if (response.status === 401 && !refreshed && !options.anonymous) {
    // Exactly once. Retrying a genuinely revoked session forever hammers the
    // API and leaves the user watching a spinner that never resolves; one
    // attempt covers the only case worth covering, an access token that just
    // aged out while the tab was in the background.
    if (await refreshOnce()) return call<T>(path, options, true);
  }

  if (!response.ok) throw await toApiError(response);
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export interface KycDocument {
  id: string;
  docType: KycUploadRequestInput['docType'];
  status: 'PENDING' | 'VERIFIED' | 'REJECTED' | 'NONE';
  createdAt: string;
}

interface UploadTicket {
  documentId: string;
  uploadUrl: string;
  token: string;
  path: string;
  kycStatus: KycDocument['status'];
}

export interface OwnerProfile {
  userId: string;
  commissionBps: number;
  isVerified: boolean;
  reliability: boolean | number;
}

export const api = {
  /**
   * OTP goes through OUR API, never straight to Supabase.
   *
   * Calling supabase.auth.signInWithOtp from the browser needs the anon key in
   * the bundle, and anything holding that key can hit /auth/v1/otp directly —
   * skipping OtpThrottleGuard, which is the only thing between us and somebody
   * spending the SMS budget a thousand messages at a time. Supabase still
   * delivers the message and still mints the session; the request just has to
   * pass a turnstile it cannot route around.
   */
  requestOtp: (phone: string) =>
    call<{ sent: true }>('/auth/otp', { method: 'POST', body: { phone }, anonymous: true }),

  verifyOtp: (phone: string, token: string) =>
    call<Session>('/auth/otp/verify', { method: 'POST', body: { phone, token }, anonymous: true }),

  /** Revokes at Supabase, not just locally — otherwise the refresh token in
   *  this browser stays valid for its full lifetime. */
  signOut: () => call<void>('/auth/signout', { method: 'POST' }),

  /** Restores a session from the stored refresh token. Returns false when there
   *  is nothing to restore, which is the signed-out case and not an error. */
  restoreSession: (): Promise<boolean> => refreshOnce(),

  me: () => call<Actor>('/auth/me'),

  applyAsOwner: (payoutAccountRef?: string) =>
    call<OwnerProfile>('/owners/apply', {
      method: 'POST',
      body: payoutAccountRef ? { payoutAccountRef } : {},
    }),

  ownerProfile: () => call<OwnerProfile>('/owners/me'),

  kyc: {
    list: () => call<KycDocument[]>('/kyc/documents'),

    readUrl: (documentId: string) =>
      call<{ url: string; expiresInSeconds: number }>(`/kyc/documents/${documentId}`),

    /**
     * The file goes browser -> storage, never through the API. We only ever
     * hold the path; the bytes are somebody's licence and there is no reason
     * for them to pass through a process that does not need to read them.
     */
    async upload(
      input: KycUploadRequestInput,
      file: Blob,
    ): Promise<{ documentId: string; kycStatus: KycDocument['status'] }> {
      const ticket = await call<UploadTicket>('/kyc/documents', { method: 'POST', body: input });

      const uploaded = await fetch(ticket.uploadUrl, {
        method: 'PUT',
        headers: { 'content-type': input.contentType },
        body: file,
      });
      if (!uploaded.ok) {
        throw new ApiError('UPSTREAM_UNAVAILABLE', uploaded.status, 'The upload did not finish. Try again.');
      }

      return { documentId: ticket.documentId, kycStatus: ticket.kycStatus };
    },
  },
};
