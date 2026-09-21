import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Actor } from '@ror/shared';
import { ApiError, api } from './api-client';
import { clearSession, hasStoredSession, setSession } from './session';

interface Auth {
  /** Who the API says we are. Null while signed out. */
  actor: Actor | null;
  /** True until the stored session has been checked, so a guarded page does
   *  not flash "signed out" on every reload. */
  loading: boolean;
  requestCode: (phone: string) => Promise<void>;
  signIn: (phone: string, code: string) => Promise<Actor>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [actor, setActor] = useState<Actor | null>(null);
  const [loading, setLoading] = useState(true);

  /**
   * The access token lives in memory, so a reload always starts signed out and
   * has to spend the stored refresh token to get back in. The API is the only
   * source of truth for role and KYC status: the token says who you are, it
   * does not say what you may do.
   */
  const restore = useCallback(async () => {
    if (!hasStoredSession()) {
      setActor(null);
      return;
    }
    if (!(await api.restoreSession())) {
      setActor(null);
      return;
    }
    try {
      setActor(await api.me());
    } catch (error) {
      if (error instanceof ApiError && error.needsSignIn) {
        clearSession();
        setActor(null);
        return;
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    void restore().finally(() => setLoading(false));
  }, [restore]);

  const value = useMemo<Auth>(
    () => ({
      actor,
      loading,
      requestCode: async (phone) => {
        await api.requestOtp(phone);
      },
      signIn: async (phone, code) => {
        setSession(await api.verifyOtp(phone, code));
        const me = await api.me();
        setActor(me);
        return me;
      },
      signOut: async () => {
        // Revoke first, while we still hold a valid access token to present.
        // A failure there must not strand the user signed in locally.
        try {
          await api.signOut();
        } finally {
          clearSession();
          setActor(null);
        }
      },
    }),
    [actor, loading],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(Ctx);
  if (!value) throw new Error('useAuth outside AuthProvider');
  return value;
}
