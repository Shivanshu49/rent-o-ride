import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { phoneSchema } from '@ror/shared';
import { ApiError } from '../lib/api-client';
import { useAuth } from '../lib/auth';

/**
 * Phone, then code. Nothing else — no password to forget and nothing for us to
 * store and later leak.
 */
export default function Login() {
  const { requestCode, signIn, actor, signOut } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [phone, setPhone] = useState('+91');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [waitSeconds, setWaitSeconds] = useState<number | null>(null);

  const fail = (caught: unknown): void => {
    if (caught instanceof ApiError) {
      setError(caught.message);
      setWaitSeconds(caught.retryAfterSeconds ?? null);
      return;
    }
    setError('Could not reach the server. Check your connection.');
  };

  const sendCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setWaitSeconds(null);

    // Same schema the API validates with, so the form cannot disagree with it.
    const parsed = phoneSchema.safeParse(phone);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter a valid phone number');
      return;
    }

    setBusy(true);
    try {
      await requestCode(parsed.data);
      setStep('code');
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  const submitCode = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await signIn(phone.trim(), code.trim());
      navigate('/trips');
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  };

  if (actor) {
    return (
      <div className="wrap" style={{ maxWidth: 460, padding: '64px 16px' }}>
        <div className="card" style={{ padding: 24 }}>
          <h1 style={{ marginTop: 0 }}>You are signed in</h1>
          <p className="muted">
            Role {actor.role.toLowerCase()} · identity {actor.kycStatus === 'VERIFIED' ? 'verified' : 'not verified'}
          </p>
          <button className="btn btn-quiet btn-block" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="wrap" style={{ maxWidth: 460, padding: '64px 16px' }}>
      <div className="card" style={{ padding: 24 }}>
        <h1 style={{ marginTop: 0, fontSize: 24 }}>
          {step === 'phone' ? 'Sign in' : 'Enter your code'}
        </h1>
        <p className="muted" style={{ marginTop: 4 }}>
          {step === 'phone'
            ? 'We send a one-time code by SMS.'
            : `Sent to ${phone}. It expires shortly.`}
        </p>

        {step === 'phone' ? (
          <form onSubmit={(e) => void sendCode(e)}>
            <label htmlFor="phone" className="muted">Phone number</label>
            <input
              id="phone"
              className="input"
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              style={{ width: '100%', margin: '6px 0 14px' }}
            />
            <button className="btn btn-block" disabled={busy} type="submit">
              {busy ? 'Sending…' : 'Send code'}
            </button>
          </form>
        ) : (
          <form onSubmit={(e) => void submitCode(e)}>
            <label htmlFor="code" className="muted">6-digit code</label>
            <input
              id="code"
              className="input"
              type="text"
              autoComplete="one-time-code"
              inputMode="numeric"
              maxLength={8}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ width: '100%', margin: '6px 0 14px', letterSpacing: '0.3em' }}
            />
            <button className="btn btn-block" disabled={busy || code.length < 4} type="submit">
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button
              className="btn btn-quiet btn-block"
              style={{ marginTop: 8 }}
              type="button"
              onClick={() => { setStep('phone'); setCode(''); setError(null); }}
            >
              Use a different number
            </button>
          </form>
        )}

        {error && (
          <p role="alert" style={{ color: 'var(--bad)', marginBottom: 0 }}>
            {error}
            {waitSeconds != null && ` Try again in about ${Math.ceil(waitSeconds / 60)} min.`}
          </p>
        )}
      </div>
    </div>
  );
}
