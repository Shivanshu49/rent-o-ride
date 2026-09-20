import { Link } from 'react-router-dom';
import Stepper from '../components/Stepper';
import VehicleArt from '../components/VehicleArt';
import { Plate, QRCode } from '../components/Bits';
import { ArrowR, Check, Doc, Headset, Key, Pin } from '../components/Icons';
import { byId, ownerOf } from '../data/seed';
import { fmtLong, relativeDay } from '../lib/dates';
import { inr } from '../lib/pricing';
import { useStore } from '../state/store';

export default function BookingConfirm() {
  const { madeBookings } = useStore();
  const booking = madeBookings[0];
  const vehicle = booking ? byId(booking.vehicleId) : null;

  if (!booking || !vehicle) {
    return (
      <div className="page wrap-wide">
        <div className="empty">
          <h2 className="h-md">No confirmed booking to show yet.</h2>
          <p className="small" style={{ margin: '8px 0 18px' }}>Complete a booking to see its pass here.</p>
          <Link to="/search" className="btn btn-primary">Browse vehicles</Link>
        </div>
      </div>
    );
  }

  const owner = ownerOf(vehicle);

  return (
    <div className="page wrap-wide">
      <Stepper current={2} />

      <div className="confirm-wrap">
        <div className="tick">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="#17805A" strokeWidth="2.6"
              strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <h1 className="h-lg">Your {vehicle.name} is booked.</h1>
        <p className="lede" style={{ marginTop: 12, marginInline: 'auto', maxWidth: 480 }}>
          {owner.name} has been notified. Pickup is {relativeDay(booking.start)} at {booking.slot} in {vehicle.area}.
        </p>

        {/* ------------------------------------------------------------ pass */}
        <div className="ticket" style={{ marginTop: 32 }}>
          <div className="ticket-top">
            <div className="summary-thumb" style={{ width: 108, height: 74 }}>
              <VehicleArt vehicle={vehicle} variant={0} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="h-sm">{vehicle.name}</div>
              <div className="small" style={{ marginTop: 3, display: 'flex', alignItems: 'center', gap: 6 }}>
                <Pin size={13} style={{ color: 'var(--surf)' }} />{vehicle.area}, {vehicle.city}
              </div>
              <div style={{ marginTop: 8 }}><Plate vehicle={vehicle} /></div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="spec-k">Paid</div>
              <div className="price-total-v" style={{ fontSize: 24 }}>{inr(booking.amount)}</div>
              <div className="tiny">{booking.method}</div>
            </div>
          </div>

          <div className="ticket-rip" />

          <div className="ticket-bot">
            <div className="ticket-fields">
              <div>
                <div className="tf-k">Booking ID</div>
                <div className="tf-v mono">{booking.id}</div>
              </div>
              <div>
                <div className="tf-k">Pickup</div>
                <div className="tf-v">{fmtLong(booking.start)}</div>
                <div className="tiny mono">{booking.slot}</div>
              </div>
              <div>
                <div className="tf-k">Return</div>
                <div className="tf-v">{fmtLong(booking.end)}</div>
                <div className="tiny mono">{booking.slot}</div>
              </div>
              <div>
                <div className="tf-k">Duration</div>
                <div className="tf-v">{booking.nights} {booking.nights === 1 ? 'day' : 'days'}</div>
              </div>
              <div>
                <div className="tf-k">Owner</div>
                <div className="tf-v">{owner.name}</div>
                <div className="tiny">Replies in {owner.responds}</div>
              </div>
              <div>
                <div className="tf-k">Deposit</div>
                <div className="tf-v">{inr(vehicle.deposit)}</div>
                <div className="tiny">Blocked at pickup</div>
              </div>
            </div>

            <div>
              <QRCode text={booking.id} size={138} />
              <div className="qr-cap">Show to unlock</div>
            </div>
          </div>
        </div>

        {/* next steps */}
        <div className="card card-pad" style={{ marginTop: 18, textAlign: 'left' }}>
          <div className="spec-k" style={{ marginBottom: 12 }}>Before you ride</div>
          <div className="pickup-row">
            <Key size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Show this QR at pickup</div>
              <div className="tiny">{owner.name.split(' ')[0]} scans it to release the keys and start your trip clock.</div>
            </div>
          </div>
          <div className="pickup-row">
            <Doc size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Carry your original licence</div>
              <div className="tiny">{vehicle.rules}</div>
            </div>
          </div>
          <div className="pickup-row">
            <Headset size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
            <div>
              <div style={{ fontWeight: 600, fontSize: 14 }}>Help is one tap away</div>
              <div className="tiny">Roadside assistance covers all of Delhi NCR, 24×7.</div>
            </div>
          </div>
        </div>

        <div className="row row-gap-12" style={{ justifyContent: 'center', marginTop: 26, flexWrap: 'wrap' }}>
          <Link to="/trips" className="btn btn-primary btn-lg">See my trips<ArrowR size={17} /></Link>
          <Link to="/search" className="btn btn-ghost btn-lg">Book another vehicle</Link>
        </div>
        <p className="tiny" style={{ marginTop: 16 }}>
          <Check size={12} style={{ display: 'inline', verticalAlign: -2, color: 'var(--good)' }} />{' '}
          A copy has been sent to your registered email and WhatsApp.
        </p>
      </div>
    </div>
  );
}
