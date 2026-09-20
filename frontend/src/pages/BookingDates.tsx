import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Calendar from '../components/Calendar';
import Stepper from '../components/Stepper';
import PriceBreakdown from '../components/PriceBreakdown';
import VehicleArt from '../components/VehicleArt';
import { Plate } from '../components/Bits';
import { ArrowR, ChevL, Clock, Info, Pin, Shield } from '../components/Icons';
import { ME_RENTER, byId, ownerOf } from '../data/seed';
import { addDays, diffDays, fmtShort, today } from '../lib/dates';
import { quote } from '../lib/pricing';
import { headlineSpec } from '../lib/specs';
import { useStore } from '../state/store';
import type { Vehicle } from '../types';

const SLOTS: readonly string[] = ['07:00', '09:00', '11:00', '13:00', '15:00', '17:00', '19:00', '21:00'];

export default function BookingDates() {
  const { id } = useParams();
  const vehicle = byId(id);

  if (!vehicle) {
    return (
      <div className="page wrap-wide">
        <div className="empty">
          <h2 className="h-md">Start by picking a vehicle.</h2>
          <Link to="/search" className="btn btn-primary" style={{ marginTop: 18 }}>Browse vehicles</Link>
        </div>
      </div>
    );
  }

  return <DatesScreen vehicle={vehicle} />;
}

function DatesScreen({ vehicle }: { vehicle: Vehicle }) {
  const navigate = useNavigate();
  const { draft, setDraft, toast } = useStore();

  const [range, setRange] = useState<{ start: Date; end: Date | null }>(() => ({
    start: draft?.start ?? addDays(today(), 3),
    end: draft?.end ?? addDays(today(), 5),
  }));
  const [slot, setSlot] = useState(draft?.slot ?? '09:00');
  const [licence, setLicence] = useState('DL-1420110012345');
  const [phone, setPhone] = useState('98110 42207');

  const nights = range.end ? Math.max(1, diffDays(range.start, range.end)) : 1;
  const q = useMemo(() => quote(vehicle, range.start, nights), [vehicle, range.start, nights]);

  useEffect(() => {
    if (range.end) {
      setDraft({ vehicleId: vehicle.id, start: range.start, end: range.end, nights, slot });
    }
  }, [vehicle, range.start, range.end, nights, slot, setDraft]);

  const owner = ownerOf(vehicle);

  function proceed(): void {
    if (!range.end) { toast('Pick a return date to continue.', 'info'); return; }
    setDraft({ vehicleId: vehicle.id, start: range.start, end: range.end, nights, slot });
    navigate('/pay');
  }

  return (
    <div className="page wrap-wide">
      <Link to={`/vehicle/${vehicle.id}`} className="btn btn-quiet btn-sm" style={{ marginBottom: 16, marginLeft: -12 }}>
        <ChevL size={15} />Back to {vehicle.name}
      </Link>

      <Stepper current={0} />

      <div className="book-grid">
        <div className="stack" style={{ gap: 26 }}>
          <section>
            <h1 className="h-md" style={{ marginBottom: 6 }}>Choose your window</h1>
            <p className="small" style={{ marginBottom: 16 }}>
              Click a start date, then an end date. Hatched days are already booked by another renter.
            </p>
            <div className="card card-pad" style={{ maxWidth: 440 }}>
              <Calendar vehicle={vehicle} mode="range" start={range.start} end={range.end}
                onChange={(n) => {
                  if (n.conflict) toast('That window crosses a booked day. Try another.', 'info');
                  if (n.start) setRange({ start: n.start, end: n.end });
                }} />
            </div>
          </section>

          <section>
            <h2 className="h-sm" style={{ marginBottom: 4 }}>Pickup time</h2>
            <p className="small" style={{ marginBottom: 12 }}>
              {owner.name.split(' ')[0]} usually replies in {owner.responds}.
            </p>
            <div className="slot-grid" style={{ maxWidth: 440 }}>
              {SLOTS.map((s) => (
                <button key={s} className={`slot ${slot === s ? 'slot-on' : ''}`} onClick={() => setSlot(s)}>
                  {s}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h2 className="h-sm" style={{ marginBottom: 12 }}>Driver details</h2>
            <div className="card card-pad" style={{ maxWidth: 440 }}>
              <div className="stack" style={{ gap: 14 }}>
                <div className="field">
                  <span className="field-label">Full name</span>
                  <input className="input" defaultValue={ME_RENTER.name} readOnly />
                </div>
                <div className="field">
                  <span className="field-label">Mobile number</span>
                  <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </div>
                <div className="field">
                  <span className="field-label">Driving licence number</span>
                  <input className="input mono" value={licence} onChange={(e) => setLicence(e.target.value)} />
                </div>
                <div className="deposit-note">
                  <Shield size={15} style={{ flex: 'none', marginTop: 1 }} />
                  <span>Your licence is verified against the VAHAN database before pickup. Carry the original.</span>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* ------------------------------------------------------------ summary */}
        <aside className="summary-card">
          <div className="card card-pad" style={{ boxShadow: 'var(--sh-3)' }}>
            <div className="summary-veh">
              <div className="summary-thumb"><VehicleArt vehicle={vehicle} variant={0} /></div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-.02em' }}>
                  {vehicle.name}
                </div>
                <div className="tiny" style={{ marginTop: 2 }}>{headlineSpec(vehicle)}</div>
                <div style={{ marginTop: 6 }}><Plate vehicle={vehicle} size="sm" /></div>
              </div>
            </div>

            <div className="price-line">
              <span className="price-line-k"><Pin size={14} />Pickup</span>
              <span className="price-line-v" style={{ fontFamily: 'var(--body)' }}>{vehicle.area}</span>
            </div>
            <div className="price-line">
              <span className="price-line-k"><Clock size={14} />From</span>
              <span className="price-line-v">{range.start ? fmtShort(range.start) : '—'} · {slot}</span>
            </div>
            <div className="price-line">
              <span className="price-line-k"><Clock size={14} />Until</span>
              <span className="price-line-v">{range.end ? fmtShort(range.end) : 'Pick a date'} · {slot}</span>
            </div>

            <div style={{ height: 1, background: 'var(--line)', margin: '14px 0 6px' }} />

            <PriceBreakdown vehicle={vehicle} q={q} />

            <button className="btn btn-accent btn-lg btn-block" style={{ marginTop: 18 }}
              onClick={proceed} disabled={!range.end}>
              Continue to payment<ArrowR size={17} />
            </button>
            <p className="tiny" style={{ display: 'flex', gap: 7, marginTop: 12 }}>
              <Info size={13} style={{ flex: 'none', marginTop: 1 }} />
              Free cancellation up to 12 hours before pickup.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
