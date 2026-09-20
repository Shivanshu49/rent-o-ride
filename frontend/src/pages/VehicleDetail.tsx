import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import VehicleArt from '../components/VehicleArt';
import Calendar from '../components/Calendar';
import MapPanel from '../components/MapPanel';
import PriceBreakdown from '../components/PriceBreakdown';
import { Plate, Rating, Stars } from '../components/Bits';
import {
  ArrowR, Calendar as CalIcon, Camera, Check, ChevL, Clock, Doc, Headset,
  Pin, Shield, Trend, TYPE_ICON, Zap,
} from '../components/Icons';
import { REVIEWS, TYPES, byId, ownerOf } from '../data/seed';
import { addDays, diffDays, fmtShort, relativeDay, today } from '../lib/dates';
import { inr, quote } from '../lib/pricing';
import { specRows } from '../lib/specs';
import { useStore } from '../state/store';
import type { CalendarRange } from '../components/Calendar';
import type { Vehicle } from '../types';

const VARIANTS = [
  { v: 0, label: 'Studio' },
  { v: 1, label: 'On the street' },
  { v: 2, label: 'Golden hour' },
  { v: 3, label: 'Spec sheet' },
];

export default function VehicleDetail() {
  const { id } = useParams();
  const vehicle = byId(id);

  if (!vehicle) {
    return (
      <div className="page wrap-wide">
        <div className="empty">
          <h2 className="h-md">That vehicle is no longer listed.</h2>
          <Link to="/search" className="btn btn-primary" style={{ marginTop: 18 }}>Back to search</Link>
        </div>
      </div>
    );
  }

  return <DetailScreen vehicle={vehicle} />;
}

function DetailScreen({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const { setDraft, toast } = useStore();

  const [shot, setShot] = useState(0);
  const [range, setRange] = useState<{ start: Date; end: Date | null }>(() => ({
    start: addDays(today(), 3),
    end: addDays(today(), 5),
  }));

  const owner = ownerOf(vehicle);
  const nights = range.end ? Math.max(1, diffDays(range.start, range.end)) : 1;
  const q = useMemo(() => quote(vehicle, range.start, nights), [vehicle, range.start, nights]);

  const TypeIcon = TYPE_ICON[vehicle.type];
  const typeLabel = TYPES.find((t) => t.id === vehicle.type)?.one;
  const variant = VARIANTS[shot] ?? VARIANTS[0]!;

  function onCalendarChange(next: CalendarRange): void {
    if (next.conflict) {
      toast('Those dates cross a booked day. Pick another window.', 'info');
    }
    if (next.start) setRange({ start: next.start, end: next.end });
  }

  function book(): void {
    if (!range.end) {
      toast('Pick a return date to continue.', 'info');
      return;
    }
    setDraft({ vehicleId: vehicle.id, start: range.start, end: range.end, nights, slot: '09:00' });
    navigate(`/book/${vehicle.id}`);
  }

  return (
    <div className="page wrap-wide">
      <Link to="/search" className="btn btn-quiet btn-sm" style={{ marginBottom: 16, marginLeft: -12 }}>
        <ChevL size={15} />All vehicles
      </Link>

      {/* ------------------------------------------------------------ header */}
      <div className="results-head" style={{ marginBottom: 22 }}>
        <div>
          <div className="row row-gap-8" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
            <span className="badge badge-type"><TypeIcon size={13} />{typeLabel}</span>
            {vehicle.ev && <span className="badge badge-ev"><Zap size={12} />Electric</span>}
            <Plate vehicle={vehicle} />
          </div>
          <h1 className="h-lg">{vehicle.name}</h1>
          <div className="row row-gap-16" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            <Rating value={vehicle.rating} count={vehicle.reviews} size={15} />
            <span className="small row row-gap-8">
              <Pin size={14} style={{ color: 'var(--surf)' }} />{vehicle.area}, {vehicle.city}
            </span>
            <span className="small mono">{vehicle.distance} km away</span>
            <span className="small">{vehicle.trips} trips completed</span>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        {/* ------------------------------------------------------- left column */}
        <div className="stack" style={{ gap: 34 }}>
          <div>
            <div className="gallery-main">
              <VehicleArt vehicle={vehicle} variant={variant.v} key={shot} />
              <span className="badge badge-type" style={{ position: 'absolute', left: 16, bottom: 16 }}>
                <Camera size={12} />{variant.label}
              </span>
            </div>
            <div className="gallery-strip">
              {VARIANTS.map((g, i) => (
                <button key={g.label} className={`gallery-thumb ${shot === i ? 'gallery-thumb-on' : ''}`}
                  onClick={() => setShot(i)} aria-label={`View ${g.label}`}>
                  <VehicleArt vehicle={vehicle} variant={g.v} />
                </button>
              ))}
            </div>
          </div>

          {/* specs — keys come from the vehicle type */}
          <section>
            <h2 className="h-md" style={{ marginBottom: 14 }}>
              {vehicle.type === 'bicycle' ? 'Cycle specs'
                : vehicle.type === 'car' ? 'Car specs' : 'Machine specs'}
            </h2>
            <div className="spec-grid">
              {specRows(vehicle).map((r) => (
                <div className="spec-cell" key={r.key}>
                  <span className="spec-k">{r.label}</span>
                  <span className="spec-v">{r.value}</span>
                </div>
              ))}
            </div>
          </section>

          {/* owner */}
          <section className="card card-pad">
            <div className="owner-row">
              <span className="avatar avatar-lg">{owner.initials}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row row-gap-8" style={{ flexWrap: 'wrap' }}>
                  <span className="h-sm">{owner.name}</span>
                  {owner.verified && (
                    <span className="badge badge-good"><Shield size={12} />Verified</span>
                  )}
                </div>
                <div className="owner-meta" style={{ marginTop: 5 }}>
                  <span className="row row-gap-8"><Rating value={owner.rating} size={13} /></span>
                  <span>{owner.trips} trips hosted</span>
                  <span>Owner since {owner.since}</span>
                  <span className="row row-gap-8"><Clock size={13} />Replies in {owner.responds}</span>
                </div>
              </div>
              <button className="btn btn-ghost btn-sm"
                onClick={() => toast(`Message sent to ${owner.name.split(' ')[0]}.`)}>
                <Headset size={15} />Message
              </button>
            </div>
          </section>

          {/* availability */}
          <section>
            <div className="results-head" style={{ marginBottom: 14 }}>
              <div>
                <h2 className="h-md">Availability</h2>
                <p className="small" style={{ marginTop: 6 }}>
                  Hatched days are already booked and cannot be selected — one vehicle, one renter, one window.
                </p>
              </div>
            </div>
            <div className="avail-grid">
              <div className="card card-pad">
                <Calendar vehicle={vehicle} mode="range" start={range.start} end={range.end}
                  onChange={onCalendarChange} />
              </div>
              <div className="stack" style={{ gap: 14 }}>
                <MapPanel vehicles={[vehicle]} className="map-detail" />
                <div className="card card-pad">
                  <div className="spec-k" style={{ marginBottom: 10 }}>Pickup point</div>
                  <div className="pickup-row">
                    <Pin size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{vehicle.area}, {vehicle.city}</div>
                      <div className="tiny">Exact address is shared once the booking is confirmed.</div>
                    </div>
                  </div>
                  <div className="pickup-row">
                    <Clock size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Handover takes about 5 minutes</div>
                      <div className="tiny">Show your QR, {owner.name.split(' ')[0]} checks your licence, you ride off.</div>
                    </div>
                  </div>
                  <div className="pickup-row">
                    <Shield size={16} style={{ color: 'var(--surf)', flex: 'none', marginTop: 1 }} />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>Carry your original licence</div>
                      <div className="tiny">A digital copy on DigiLocker works too.</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* what's included */}
          <section>
            <h2 className="h-md" style={{ marginBottom: 14 }}>What comes with it</h2>
            <div className="feature-list">
              {vehicle.features.map((f) => (
                <span className="feature-item" key={f}>
                  <Check size={15} style={{ color: 'var(--good)', flex: 'none' }} sw={2.4} />{f}
                </span>
              ))}
            </div>
            <div className="deposit-note" style={{ marginTop: 18 }}>
              <Doc size={15} style={{ flex: 'none', marginTop: 1 }} />
              <span><b>Owner’s note.</b> {vehicle.rules}</span>
            </div>
          </section>

          {/* reviews */}
          <section>
            <div className="results-head" style={{ marginBottom: 16 }}>
              <h2 className="h-md">
                {vehicle.reviews} reviews · {vehicle.rating.toFixed(1)} average
              </h2>
            </div>
            <div className="stack" style={{ gap: 12 }}>
              {REVIEWS.map((r) => (
                <div className="card card-pad" key={r.by}>
                  <div className="row row-gap-12">
                    <span className="avatar">{r.initials}</span>
                    <div style={{ flex: 1 }}>
                      <div className="row row-gap-12" style={{ flexWrap: 'wrap' }}>
                        <b style={{ fontSize: 14.5 }}>{r.by}</b>
                        <Stars value={r.stars} size={13} />
                        <span className="tiny">{r.when}</span>
                      </div>
                    </div>
                  </div>
                  <p className="small" style={{ marginTop: 10, lineHeight: 1.6 }}>{r.text}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------ booking panel */}
        <aside className="book-panel">
          <div className="card card-pad" style={{ boxShadow: 'var(--sh-3)' }}>
            <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div className="price-day" style={{ fontSize: 30 }}>
                  {inr(vehicle.daily)}<span className="price-unit"> /day</span>
                </div>
                <div className="price-hr" style={{ marginTop: 4 }}>or {inr(vehicle.hourly)} per hour</div>
              </div>
              {q.demand.mult > 1 && (
                <span className="badge badge-demand">
                  <Trend size={12} />{q.demand.label}: {q.demand.mult}x
                </span>
              )}
            </div>

            <div className="row row-gap-8" style={{ margin: '18px 0 14px', gap: 8 }}>
              <div className="card card-flat" style={{ flex: 1, padding: '10px 13px', borderRadius: 'var(--r-sm)' }}>
                <div className="spec-k">Pick-up</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {range.start ? fmtShort(range.start) : '—'}
                </div>
              </div>
              <div className="card card-flat" style={{ flex: 1, padding: '10px 13px', borderRadius: 'var(--r-sm)' }}>
                <div className="spec-k">Return</div>
                <div style={{ fontWeight: 600, fontSize: 14 }}>
                  {range.end ? fmtShort(range.end) : 'Pick a date'}
                </div>
              </div>
            </div>
            <p className="tiny" style={{ marginBottom: 16 }}>
              <CalIcon size={11} style={{ display: 'inline', verticalAlign: -1 }} />{' '}
              Change these on the availability calendar. Starts {relativeDay(range.start)}.
            </p>

            <PriceBreakdown vehicle={vehicle} q={q} />

            <button className="btn btn-accent btn-lg btn-block" style={{ marginTop: 18 }} onClick={book}>
              Book now<ArrowR size={17} />
            </button>
            <p className="tiny" style={{ textAlign: 'center', marginTop: 10 }}>
              You won’t be charged yet — payment is the last step.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
