import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Stepper from '../components/Stepper';
import VehicleArt from '../components/VehicleArt';
import { Plate } from '../components/Bits';
import { Bank, Card, ChevL, Lock, Phone, Wallet } from '../components/Icons';
import { byId } from '../data/seed';
import { fmtShort } from '../lib/dates';
import { toPaise } from '@ror/shared';
import { inr, makeBookingId, quote } from '../lib/pricing';
import { useStore } from '../state/store';

import type { ComponentType } from 'react';
import type { IconProps } from '../components/Icons';
import type { BookingDraft, Vehicle } from '../types';

const METHODS: readonly { id: string; icon: ComponentType<IconProps>; title: string; sub: string }[] = [
  { id: 'upi', icon: Phone, title: 'UPI', sub: 'Google Pay, PhonePe, Paytm, BHIM' },
  { id: 'card', icon: Card, title: 'Card', sub: 'Visa, Mastercard, RuPay, Amex' },
  { id: 'netbanking', icon: Bank, title: 'Netbanking', sub: 'All major Indian banks' },
  { id: 'wallet', icon: Wallet, title: 'Wallet', sub: 'Paytm, Amazon Pay, Mobikwik' },
];

const UPI_APPS: readonly string[] = ['GPay', 'PhonePe', 'Paytm', 'BHIM'];

/** Mock wallet balance, so the split-payment notice has a number to show. */
const WALLET_BALANCE = toPaise(2480);

/**
 * Guard and screen are separate components on purpose: the screen can then take
 * a non-null draft and vehicle as props, so nothing below has to re-check them
 * or assert them away. It also keeps every hook above an early return.
 */
export default function BookingPay() {
  const { draft } = useStore();
  const vehicle = draft ? byId(draft.vehicleId) : undefined;

  if (!draft || !vehicle) {
    return (
      <div className="page wrap-wide">
        <div className="empty">
          <h2 className="h-md">There is no booking in progress.</h2>
          <p className="small" style={{ margin: '8px 0 18px' }}>Pick a vehicle and dates first.</p>
          <Link to="/search" className="btn btn-primary">Browse vehicles</Link>
        </div>
      </div>
    );
  }

  return <PayScreen draft={draft} vehicle={vehicle} />;
}

function PayScreen({ draft, vehicle }: { draft: BookingDraft; vehicle: Vehicle }) {
  const navigate = useNavigate();
  const { addBooking, toast } = useStore();
  const [method, setMethod] = useState('upi');
  const [app, setApp] = useState('GPay');
  const [vpa, setVpa] = useState('shivanshu@okhdfcbank');
  const [busy, setBusy] = useState(false);

  const q = useMemo(() => quote(vehicle, draft.start, draft.nights), [vehicle, draft]);

  function pay(): void {
    setBusy(true);
    // Mock gateway round-trip so the demo shows a real processing state.
    setTimeout(() => {
      const booking = {
        id: makeBookingId(),
        vehicleId: vehicle.id,
        start: draft.start,
        end: draft.end,
        nights: draft.nights,
        slot: draft.slot,
        amount: q.total,
        method: method === 'upi' ? `UPI · ${app}` : (METHODS.find((m) => m.id === method)?.title ?? method),
        madeAt: new Date(),
      };
      addBooking(booking);
      toast(`Payment of ${inr(q.total)} received.`);
      navigate('/confirmation');
    }, 1900);
  }

  return (
    <div className="page wrap-wide">
      <Link to={`/book/${vehicle.id}`} className="btn btn-quiet btn-sm" style={{ marginBottom: 16, marginLeft: -12 }}>
        <ChevL size={15} />Back to dates
      </Link>

      <Stepper current={1} />

      <div className="pay-shell">
        {/* trip line — what is actually being paid for */}
        <div className="card card-pad" style={{ marginBottom: 18, display: 'flex', gap: 13, alignItems: 'center' }}>
          <div className="summary-thumb"><VehicleArt vehicle={vehicle} variant={0} /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-.02em' }}>{vehicle.name}</div>
            <div className="tiny" style={{ marginTop: 2 }}>
              {fmtShort(draft.start)} → {fmtShort(draft.end)} · {draft.nights} {draft.nights === 1 ? 'day' : 'days'}
            </div>
            <div style={{ marginTop: 6 }}><Plate vehicle={vehicle} size="sm" /></div>
          </div>
        </div>

        {/* -------------------------------------------------- gateway checkout */}
        <div className="pay-card">
          <div className="pay-head">
            <span className="pay-merch-logo">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 16h16" stroke="#0B1622" strokeWidth="2" strokeLinecap="round" />
                <circle cx="7.5" cy="16" r="2.6" stroke="#0B1622" strokeWidth="2" />
                <circle cx="16.5" cy="16" r="2.6" stroke="#0B1622" strokeWidth="2" />
                <path d="M5.5 11.5L7.5 6h9l2.5 5.5" stroke="#11889B" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <div className="pay-merch-name">RentAny Mobility</div>
              <div className="pay-merch-sub">Secured by mock gateway</div>
            </div>
            <div className="pay-amt">
              <div className="pay-amt-n">{inr(q.total)}</div>
              <div className="pay-amt-l">TO PAY</div>
            </div>
          </div>

          <div className="pay-body">
            <div className="pay-methods">
              {METHODS.map((m) => (
                <button key={m.id} className={`pay-method ${method === m.id ? 'pay-method-on' : ''}`}
                  onClick={() => setMethod(m.id)}>
                  <span className="pay-method-ic"><m.icon size={19} style={{ color: '#3C4A5A' }} /></span>
                  <span>
                    <span className="pay-method-t" style={{ display: 'block' }}>{m.title}</span>
                    <span className="pay-method-s">{m.sub}</span>
                  </span>
                  <span className="pay-radio"><i /></span>
                </button>
              ))}
            </div>

            {method === 'upi' && (
              <>
                <div className="pay-upi-row" style={{ paddingTop: 14 }}>
                  {UPI_APPS.map((a) => (
                    <button key={a} className={`pay-upi-app ${app === a ? 'pay-upi-on' : ''}`} onClick={() => setApp(a)}>
                      {a}
                    </button>
                  ))}
                </div>
                <div style={{ padding: '0 20px 4px' }}>
                  <div className="field">
                    <span className="field-label">UPI ID</span>
                    <input className="input mono" value={vpa} onChange={(e) => setVpa(e.target.value)} />
                  </div>
                </div>
              </>
            )}

            {method === 'card' && (
              <div style={{ padding: '16px 20px 4px', display: 'grid', gap: 12 }}>
                <div className="field">
                  <span className="field-label">Card number</span>
                  <input className="input mono" defaultValue="4111 1111 1111 1111" />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="field">
                    <span className="field-label">Expiry</span>
                    <input className="input mono" defaultValue="09 / 29" />
                  </div>
                  <div className="field">
                    <span className="field-label">CVV</span>
                    <input className="input mono" defaultValue="•••" />
                  </div>
                </div>
              </div>
            )}

            {method === 'netbanking' && (
              <div style={{ padding: '16px 20px 4px' }}>
                <div className="field">
                  <span className="field-label">Choose your bank</span>
                  <select className="input" defaultValue="HDFC Bank">
                    {['HDFC Bank', 'ICICI Bank', 'State Bank of India', 'Axis Bank', 'Kotak Mahindra'].map((b) => (
                      <option key={b}>{b}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {method === 'wallet' && (
              <div style={{ padding: '16px 20px 4px' }}>
                <div className="deposit-note">
                  <Wallet size={15} style={{ flex: 'none', marginTop: 1 }} />
                  <span>Your Paytm wallet balance is {inr(WALLET_BALANCE)}. The remainder will be charged to UPI.</span>
                </div>
              </div>
            )}
          </div>

          <div className="pay-foot">
            <button className="pay-btn" onClick={pay} disabled={busy}>
              {busy ? <><span className="spin" /> Processing…</> : `Pay ${inr(q.total)}`}
            </button>
            <div className="pay-secure">
              <Lock size={12} />
              Prototype checkout — no real money moves
            </div>
          </div>
        </div>

        <p className="tiny" style={{ textAlign: 'center', marginTop: 16 }}>
          A refundable deposit of {inr(q.deposit)} is blocked separately at pickup.
        </p>
      </div>
    </div>
  );
}
