import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import VehicleArt from '../components/VehicleArt';
import { Plate, Rating, StatusPill } from '../components/Bits';
import {
  ArrowR, Bolt, Check, Doc, Plus, Trend, TYPE_ICON, Wallet, Wrench,
} from '../components/Icons';
import {
  EARNINGS, ME_OWNER, OWNER_BOOKINGS, OWNER_VEHICLE_IDS, requireById,
} from '../data/seed';
import type { VehicleStatus } from '../types';
import { addDays, fmtTiny, today } from '../lib/dates';
import { inr, inrShort } from '../lib/pricing';
import { headlineSpec } from '../lib/specs';
import { useStore } from '../state/store';

const STATUSES: readonly (readonly [id: VehicleStatus, label: string, tone: string])[] = [
  ['available', 'Available', 'seg-on-good'],
  ['rented', 'On rent', 'seg-on-warn'],
  ['maintenance', 'Service', 'seg-on-bad'],
];

/** Deterministic 30-day occupancy strip: 0 free, 1 part-day, 2 booked. */
const UTIL_DAYS: readonly number[] = [2,2,2,0,0,1,2,2,0,2,2,2,2,0,0,0,1,2,2,2,0,2,2,0,0,1,2,2,2,0];

export default function OwnerDashboard() {
  const { statuses, setStatus, toast } = useStore();

  const totals = useMemo(() => {
    const year = EARNINGS.reduce((s, e) => s + e.v, 0);
    const thisMonth = EARNINGS.at(-1)?.v ?? 0;
    const lastMonth = EARNINGS.at(-2)?.v ?? 0;
    const growth = ((thisMonth - lastMonth) / lastMonth) * 100;
    const booked = UTIL_DAYS.filter((d) => d === 2).length;
    const part = UTIL_DAYS.filter((d) => d === 1).length;
    const util = Math.round(((booked + part * 0.5) / UTIL_DAYS.length) * 100);
    return { year, thisMonth, growth, util, booked };
  }, []);

  const peak = Math.max(...EARNINGS.map((e) => e.v));
  const vehicles = OWNER_VEHICLE_IDS.map(requireById);
  const live = vehicles.filter((v) => statuses[v.id] !== 'maintenance').length;

  return (
    <div className="page wrap-wide">
      <div className="dash-head">
        <div>
          <span className="eyebrow">Owner dashboard</span>
          <h1 className="h-lg" style={{ marginTop: 10 }}>Good evening, {ME_OWNER.name.split(' ')[0]}.</h1>
          <p className="small" style={{ marginTop: 8 }}>
            {live} of your {vehicles.length} vehicles are earning right now. Next payout lands on the 1st.
          </p>
        </div>
        <div className="row row-gap-12" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost" onClick={() => toast('Payout statement downloaded.')}>
            <Doc size={16} />Statement
          </button>
          <button className="btn btn-primary" onClick={() => toast('Listing draft created.')}>
            <Plus size={16} />List a vehicle
          </button>
        </div>
      </div>

      {/* --------------------------------------------------------------- stats */}
      <div className="stat-grid">
        <div className="stat">
          <div className="stat-k">Earnings · last 12 months</div>
          <div className="stat-v">{inr(totals.year)}</div>
          <div className="stat-sub">
            <Wallet size={14} style={{ color: 'var(--muted-2)' }} />
            Across {ME_OWNER.trips} completed trips
          </div>
        </div>

        <div className="stat">
          <div className="stat-k">This month</div>
          <div className="stat-v">{inr(totals.thisMonth)}</div>
          <div className="stat-sub">
            <Trend size={14} style={{ color: 'var(--good)' }} />
            <span className="trend-up">+{totals.growth.toFixed(1)}%</span> vs last month
          </div>
        </div>

        <div className="stat">
          <div className="stat-k">Active listings</div>
          <div className="stat-v">{live}<span style={{ fontSize: 17, color: 'var(--muted-2)' }}> / {vehicles.length}</span></div>
          <div className="stat-sub">
            <Rating value={ME_OWNER.rating} size={13} />
            <span>owner rating</span>
          </div>
        </div>

        <div className="stat">
          <div className="stat-k">Utilisation · 30 days</div>
          <div className="stat-v">{totals.util}%</div>
          <div className="util-strip" role="img"
            aria-label={`${totals.booked} of 30 days fully booked`}>
            {UTIL_DAYS.map((d, i) => (
              <i key={i} className={`util-cell ${d === 2 ? 'util-cell-on' : d === 1 ? 'util-cell-part' : ''}`}
                title={`Day ${i + 1}: ${d === 2 ? 'booked' : d === 1 ? 'part day' : 'free'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------ chart + listings */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.15fr) minmax(0,1fr)', gap: 22, marginTop: 22, alignItems: 'start' }}
        className="owner-split">
        <section className="card card-pad">
          <div className="results-head" style={{ marginBottom: 4 }}>
            <div>
              <h2 className="h-sm">Monthly earnings</h2>
              <p className="tiny">August is your best month so far.</p>
            </div>
            <span className="badge badge-surf"><Bolt size={12} />{inrShort(peak)} peak</span>
          </div>
          <div className="chart">
            {EARNINGS.map((e, i) => (
              <div className="chart-col" key={e.m}>
                <div className="chart-bar" style={{
                  height: `${(e.v / peak) * 100}%`,
                  animationDelay: `${i * 45}ms`,
                }} data-v={e.v}>
                  <span className="chart-val">{inrShort(e.v)}</span>
                </div>
                <span className="chart-x">{e.m}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card card-pad">
          <div className="results-head" style={{ marginBottom: 6 }}>
            <div>
              <h2 className="h-sm">Your vehicles</h2>
              <p className="tiny">Switch a vehicle off and it stops taking new bookings.</p>
            </div>
          </div>
          {vehicles.map((v) => {
            const TypeIcon = TYPE_ICON[v.type];
            const st = statuses[v.id];
            return (
              <div className="listing-row" key={v.id}>
                <div className="summary-thumb" style={{ width: 68, height: 48 }}>
                  <VehicleArt vehicle={v} variant={0} />
                </div>
                <div style={{ flex: 1, minWidth: 140 }}>
                  <Link to={`/vehicle/${v.id}`} style={{ fontWeight: 600, fontSize: 14.5 }}>{v.name}</Link>
                  <div className="tiny" style={{ marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <TypeIcon size={12} />{inr(v.daily)}/day · {v.trips} trips
                  </div>
                  <div style={{ marginTop: 6 }}><Plate vehicle={v} size="sm" /></div>
                </div>
                <div className="seg" role="group" aria-label={`Status for ${v.name}`}>
                  {STATUSES.map(([id, label, tone]) => (
                    <button key={id}
                      className={`seg-btn ${st === id ? `seg-on ${tone}` : ''}`}
                      onClick={() => { setStatus(v.id, id); toast(`${v.name} marked ${label.toLowerCase()}.`); }}>
                      {id === 'maintenance' && st === id && <Wrench size={11} style={{ marginRight: 4, verticalAlign: -1 }} />}
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {/* ---------------------------------------------------------- bookings */}
      <section style={{ marginTop: 30 }}>
        <div className="results-head" style={{ marginBottom: 14 }}>
          <div>
            <h2 className="h-md">Recent bookings</h2>
            <p className="small" style={{ marginTop: 6 }}>Everything renters have booked across your listings.</p>
          </div>
          <Link to="/search" className="btn btn-ghost btn-sm">View listings<ArrowR size={15} /></Link>
        </div>

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Booking</th><th>Renter</th><th>Vehicle</th><th>Dates</th>
                <th>Nights</th><th>Payout</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {OWNER_BOOKINGS.map((b) => {
                const v = requireById(b.vehicleId);
                const start = addDays(today(), b.days);
                const end = addDays(start, b.nights);
                return (
                  <tr key={b.id}>
                    <td className="mono" style={{ fontSize: 12.5 }}>{b.id}</td>
                    <td>
                      <span className="row row-gap-8">
                        <span className="avatar" style={{ width: 28, height: 28, fontSize: 10.5 }}>{b.initials}</span>
                        {b.renter}
                      </span>
                    </td>
                    <td>
                      <Link to={`/vehicle/${v.id}`} style={{ fontWeight: 500 }}>{v.name}</Link>
                      <div className="tiny">{headlineSpec(v)}</div>
                    </td>
                    <td className="mono" style={{ fontSize: 12.5 }}>{fmtTiny(start)} — {fmtTiny(end)}</td>
                    <td className="mono">{b.nights}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>{inr(Math.round(b.amount * 0.85))}</td>
                    <td><StatusPill status={b.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="deposit-note" style={{ marginTop: 14 }}>
          <Check size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>Payout shown is after the 15% RentAny commission. Money reaches your account two days after each trip ends.</span>
        </div>
      </section>
    </div>
  );
}
