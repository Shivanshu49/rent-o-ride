/**
 * The browser's half of the session, and nothing else.
 *
 * There is no Supabase client in this app any more. The anon key is a
 * credential: anything holding it can POST /auth/v1/otp directly, which routes
 * around OtpThrottleGuard and makes the per-phone limit — the only thing
 * bounding our SMS bill — decoration. So the key stays in the API process, and
 * the browser talks to the API for send, verify, refresh and sign-out alike.
 * `scripts/check-bundle.mjs` fails CI if the key or a Supabase auth URL ever
 * reappears in the built output.
 *
 * The access token is held in memory only: it is short-lived, and a page reload
 * costs one refresh call. The refresh token is persisted, because otherwise
 * every reload is a new sign-in.
 *
 * ponytail: localStorage, which is the exposure supabase-js already had — an
 * XSS can read it. An httpOnly cookie scoped to /auth would close that, and is
 * the upgrade to make when the API and the web app share a registrable domain;
 * across origins SameSite would drop it and sign-in would silently stop working.
 */
const REFRESH_KEY = 'ror.refresh';

let accessToken: string | null = null;

export interface Session {
  accessToken: string;
  refreshToken: string;
}

/** Storage throws in a private window and in some embedded webviews. A session
 *  that does not survive a reload is much better than an app that will not
 *  render. */
const safely = <T>(read: () => T, fallback: T): T => {
  try {
    return read();
  } catch {
    return fallback;
  }
};

export const getAccessToken = (): string | null => accessToken;

export const getRefreshToken = (): string | null =>
  safely(() => window.localStorage.getItem(REFRESH_KEY), null);

export function setSession(session: Session): void {
  accessToken = session.accessToken;
  safely(() => window.localStorage.setItem(REFRESH_KEY, session.refreshToken), undefined);
}

export function clearSession(): void {
  accessToken = null;
  safely(() => window.localStorage.removeItem(REFRESH_KEY), undefined);
}

/** True when a reload might still be able to restore a session. */
export const hasStoredSession = (): boolean => getRefreshToken() !== null;
