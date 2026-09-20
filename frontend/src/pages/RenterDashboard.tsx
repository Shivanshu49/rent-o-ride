import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import VehicleArt from '../components/VehicleArt';
import { Plate, QRCode, Rating, Stars, StatusPill } from '../components/Bits';
import {
  ArrowR, Calendar as CalIcon, Check, Clock, Key, Pin, Route, Sparkle, Wallet,
} from '../components/Icons';
import { ME_RENTER, RENTER_BOOKINGS, ownerOf, requireById } from '../data/seed';
import type { BookingStatus, MadeBooking, RenterBooking } from '../types';
import { addDays, fmtShort, fmtTiny, relativeDay, today } from '../lib/dates';
import { sumPaise, type Paise } from '@ror/shared';
import { inr } from '../lib/pricing';
import { useStore } from '../state/store';

/**
 * One list, two sources. Seed bookings store day offsets so the demo never goes
 * stale; bookings made in this session carry real dates. Both come out with
 * absolute startDate/endDate so the rest of the screen stops caring which.
 */
interface Trip {
  id: string;
  vehicleId: string;
  nights: number;
  amount: Paise;
  status: BookingStatus;
  startDate: Date;
  endDate: Date;
  fresh?: boolean;
}

function hydrateMade(b: MadeBooking): Trip {
  return {
    id: b.id, vehicleId: b.vehicleId, nights: b.nights, amount: b.amount,
    status: 'upcoming', startDate: b.start, endDate: b.end, fresh: true,
  };
}

function hydrateSeed(b: RenterBooking): Trip {
  const start = addDays(today(), b.start);
  return {
    id: b.id, vehicleId: b.vehicleId, nights: b.nights, amount: b.amount,
    status: b.status, startDate: start, endDate: addDays(start, b.nights),
  };
}

export default function RenterDashboard() {
  const { madeBookings, ratings, rate, toast } = useStore();

  const all = useMemo(
    () => [...madeBookings.map(hydrateMade), ...RENTER_BOOKINGS.map(hydrateSeed)],
    [madeBookings]
  );

  const live = all.filter((b) => b.status === 'ongoing');
  const upcoming = all.filter((b) => b.status === 'upcoming')
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  const past = all.filter((b) => b.status === 'past');

  const spent = sumPaise(all.map((b) => b.amount));
  const unrated = past.filter((b) => !ratings[b.id]).length;

  return (
    <div className="page wrap-wide">
      <div className="dash-head">
        <div>
          <span className="eyebrow">My trips</span>
          <h1 className="h-lg" style={{ marginTop: 10 }}>Welcome back, {ME_RENTER.name.split(' ')[0]}.</h1>
          <p className="small" style={{ marginTop: 8 }}>
            {live.length ? 'You have a trip running right now. ' : ''}
            {upcoming.length} upcoming · {past.length} completed
          </p>
        </div>
        <Link to="/search" className="btn btn-primary">Book a vehicle<ArrowR size={16} /></Link>
      </div>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-k">Trips taken</div>
          <div className="stat-v">{past.length + live.length}</div>
          <div className="stat-sub"><Route size={14} style={{ color: 'var(--muted-2)' }} />Member since {ME_RENTER.since}</div>
        </div>
        <div className="stat">
          <div className="stat-k">Total spent</div>
          <div className="stat-v">{inr(spent)}</div>
          <div className="stat-sub"><Wallet size={14} style={{ color: 'var(--muted-2)' }} />Across all vehicle types</div>
        </div>
        <div className="stat">
          <div className="stat-k">Your renter rating</div>
          <div className="stat-v">{ME_RENTER.rating.toFixed(1)}</div>
          <div className="stat-sub"><Stars value={Math.round(ME_RENTER.rating)} size={13} /></div>
        </div>
        <div className="stat">
          <div className="stat-k">Trips awaiting a rating</div>
          <div className="stat-v">{unrated}</div>
          <div className="stat-sub"><Sparkle size={14} style={{ color: 'var(--muted-2)' }} />Owners see your rating too</div>
        </div>
      </div>

      {/* ------------------------------------------------------------ ongoing */}
      {live.length > 0 && (
        <section style={{ marginTop: 34 }}>
          <h2 className="h-md" style={{ marginBottom: 14 }}>Happening now</h2>
          {live.map((b) => {
            const v = requireById(b.vehicleId);
            const owner = ownerOf(v);
            return (
              <div className="card card-pad brow-live" key={b.id}
                style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="summary-thumb" style={{ width: 128, height: 88 }}>
                  <VehicleArt vehicle={v} variant={1} />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div className="row row-gap-8" style={{ flexWrap: 'wrap', marginBottom: 7 }}>
                    <StatusPill status="ongoing" />
                    <Plate vehicle={v} size="sm" />
                  </div>
                  <div className="h-sm">{v.name}</div>
                  <div className="small" style={{ marginTop: 5, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span className="row row-gap-8"><Pin size={13} style={{ color: 'var(--surf)' }} />{v.area}</span>
                    <span className="row row-gap-8"><Clock size={13} />Due back {fmtShort(b.endDate)}</span>
                    <span>Owner {owner.name}</span>
                  </div>
                  <div className="row row-gap-12" style={{ marginTop: 12, flexWrap: 'wrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => toast('Trip extended by one day.')}>
                      Extend trip
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toast(`Calling ${owner.name.split(' ')[0]}…`, 'info')}>
                      Contact owner
                    </button>
                  </div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <QRCode text={b.id} size={104} />
                  <div className="qr-cap" style={{ color: 'var(--muted-2)' }}>{b.id}</div>
                </div>
              </div>
            );
          })}
        </section>
      )}

      {/* ----------------------------------------------------------- upcoming */}
      <section style={{ marginTop: 34 }}>
        <div className="results-head" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="h-md">Upcoming bookings</h2>
            <p className="small" style={{ marginTop: 6 }}>Show the QR at pickup to unlock the vehicle.</p>
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {upcoming.length === 0 && (
            <div className="empty">
              <h3 className="h-sm">No trips booked yet.</h3>
              <Link to="/search" className="btn btn-primary" style={{ marginTop: 16 }}>Find a vehicle</Link>
            </div>
          )}
          {upcoming.map((b) => {
            const v = requireById(b.vehicleId);
            const owner = ownerOf(v);
            return (
              <div className="brow" key={b.id}>
                <div className="brow-thumb"><VehicleArt vehicle={v} variant={0} /></div>
                <div style={{ minWidth: 0 }}>
                  <div className="row row-gap-8" style={{ flexWrap: 'wrap', marginBottom: 5 }}>
                    <Link to={`/vehicle/${v.id}`} style={{ fontWeight: 700, fontSize: 15.5 }}>{v.name}</Link>
                    {b.fresh && <span className="badge badge-good"><Check size={11} />Just booked</span>}
                  </div>
                  <div className="small" style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                    <span className="row row-gap-8"><CalIcon size={13} />{fmtTiny(b.startDate)} — {fmtTiny(b.endDate)}</span>
                    <span className="row row-gap-8"><Pin size={13} />{v.area}</span>
                    <span>Owner {owner.name}</span>
                  </div>
                  <div className="row row-gap-8" style={{ marginTop: 8, flexWrap: 'wrap' }}>
                    <Plate vehicle={v} size="sm" />
                    <span className="countdown"><Key size={12} />Pickup <b>{relativeDay(b.startDate)}</b></span>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="price-day">{inr(b.amount)}</div>
                  <div className="tiny mono" style={{ marginTop: 2 }}>{b.id}</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                    onClick={() => toast('Booking cancelled. Refund in 3 working days.', 'info')}>
                    Cancel
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* --------------------------------------------------------------- past */}
      <section style={{ marginTop: 34 }}>
        <div className="results-head" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="h-md">Past trips</h2>
            <p className="small" style={{ marginTop: 6 }}>
              {unrated > 0
                ? `${unrated} ${unrated === 1 ? 'trip is' : 'trips are'} still waiting for your rating.`
                : 'Thanks — every trip here has been rated.'}
            </p>
          </div>
        </div>
        <div className="stack" style={{ gap: 12 }}>
          {past.map((b) => {
            const v = requireById(b.vehicleId);
            const owner = ownerOf(v);
            const given = ratings[b.id];
            return (
              <div className="brow" key={b.id}>
                <div className="brow-thumb"><VehicleArt vehicle={v} variant={0} /></div>
                <div style={{ minWidth: 0 }}>
                  <Link to={`/vehicle/${v.id}`} style={{ fontWeight: 700, fontSize: 15.5 }}>{v.name}</Link>
                  <div className="small" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 5 }}>
                    <span className="row row-gap-8"><CalIcon size={13} />{fmtTiny(b.startDate)} — {fmtTiny(b.endDate)}</span>
                    <span>{b.nights} {b.nights === 1 ? 'day' : 'days'}</span>
                    <span>Owner {owner.name}</span>
                    <Rating value={v.rating} size={13} />
                  </div>
                  <div className="row row-gap-12" style={{ marginTop: 9, flexWrap: 'wrap' }}>
                    <span className="tiny">{given ? 'You rated this trip' : 'Rate this trip'}</span>
                    <Stars value={given ?? 0} onRate={(n) => {
                      rate(b.id, n);
                      toast(`Thanks — you rated ${v.name} ${n} star${n > 1 ? 's' : ''}.`);
                    }} />
                    {(given ?? 0) > 0 && <span className="badge badge-good"><Check size={11} />Rated</span>}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="price-day">{inr(b.amount)}</div>
                  <div className="tiny mono" style={{ marginTop: 2 }}>{b.id}</div>
                  <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                    onClick={() => toast('Invoice downloaded.')}>Invoice</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ------------------------------------------------------------ history */}
      <section style={{ marginTop: 34 }}>
        <h2 className="h-md" style={{ marginBottom: 14 }}>Booking history</h2>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th><th>Vehicle</th><th>City</th><th>Dates</th>
                <th>Days</th><th>Paid</th><th>Status</th><th>Your rating</th>
              </tr>
            </thead>
            <tbody>
              {all.map((b) => {
                const v = requireById(b.vehicleId);
                return (
                  <tr key={b.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{b.id}</td>
                    <td><Link to={`/vehicle/${v.id}`} style={{ fontWeight: 500 }}>{v.name}</Link></td>
                    <td>{v.city}</td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{fmtTiny(b.startDate)} — {fmtTiny(b.endDate)}</td>
                    <td className="mono">{b.nights}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{inr(b.amount)}</td>
                    <td><StatusPill status={b.status} /></td>
                    <td>{ratings[b.id] ? <Stars value={ratings[b.id] ?? 0} size={13} /> : <span className="tiny">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
