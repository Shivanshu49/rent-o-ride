import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import VehicleArt from '../components/VehicleArt';
import VehicleCard from '../components/VehicleCard';
import { Plate } from '../components/Bits';
import {
  ArrowR, Calendar, Headset, Key, Pin, Search as SearchIcon, Shield,
  Sparkle, TYPE_ICON, Wallet,
} from '../components/Icons';
import { CITIES, TYPES, VEHICLES, requireById } from '../data/seed';
import type { VehicleType } from '../types';
import { addDays, isoKey, today } from '../lib/dates';
import { inr } from '../lib/pricing';
import { useStore } from '../state/store';

const HERO_VEHICLE = 'v4';

const STEPS = [
  { n: 'Step 01', icon: SearchIcon, h: 'Find one nearby',
    p: 'Filter by type, price and how far you are willing to walk. Every listing shows its real distance from you, not a vague neighbourhood.' },
  { n: 'Step 02', icon: Calendar, h: 'Book the exact dates',
    p: 'Days already taken are blocked on the owner’s calendar. Pick your window and the vehicle is held for you alone.' },
  { n: 'Step 03', icon: Key, h: 'Unlock with your QR',
    p: 'Show the code at pickup. The owner scans it, hands over the keys, and your trip clock starts the moment you ride off.' },
];

const TRUST = [
  { icon: Shield, h: 'Owners are verified', p: 'Aadhaar, licence and vehicle papers are checked before a listing goes live.' },
  { icon: Wallet, h: '₹5 lakh trip cover', p: 'Damage and third-party cover is bundled into every booking. Nothing to tick.' },
  { icon: Sparkle, h: 'Surge printed upfront', p: 'When a weekend runs hot, the multiplier sits on the price, not buried in the total.' },
  { icon: Headset, h: 'Roadside help, 24×7', p: 'One tap from your booking reaches a partner garage anywhere in NCR.' },
];

export default function Landing() {
  const navigate = useNavigate();
  const { city, setCity } = useStore();
  const [tab, setTab] = useState('car');
  const [from, setFrom] = useState(() => isoKey(addDays(today(), 3)));
  const [to, setTo] = useState(() => isoKey(addDays(today(), 5)));

  const hero = requireById(HERO_VEHICLE);
  const counts = useMemo(() => {
    const c: Partial<Record<VehicleType, number>> = {};
    for (const v of VEHICLES) c[v.type] = (c[v.type] ?? 0) + 1;
    return c;
  }, []);
  const shown = useMemo(
    () => VEHICLES.filter((v) => v.type === tab).slice(0, 4), [tab]
  );

  function runSearch(e: FormEvent): void {
    e.preventDefault();
    navigate(`/search?city=${encodeURIComponent(city)}&from=${from}&to=${to}`);
  }

  return (
    <>
      {/* ------------------------------------------------------------ hero */}
      <section className="hero">
        <div className="hero-glow" />
        <svg className="hero-bg" viewBox="0 0 1440 620" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <g stroke="#37C2C8" strokeOpacity=".13" strokeWidth="1" fill="none">
            <path d="M-40 470 C 240 470 300 300 560 300 S 900 130 1200 130 1480 130 1480 130" />
            <path d="M-40 540 C 300 540 380 380 660 380 S 1020 220 1480 220" />
            <path d="M-40 600 C 360 600 460 460 760 460 S 1120 320 1480 320" />
          </g>
          <g fill="#F4C430" fillOpacity=".28">
            <circle cx="560" cy="300" r="3.5" /><circle cx="1200" cy="130" r="3.5" />
            <circle cx="660" cy="380" r="3.5" /><circle cx="760" cy="460" r="3.5" />
          </g>
        </svg>

        <div className="wrap-wide hero-inner">
          <div className="hero-copy">
            <span className="hero-eyebrow">
              <span className="badge badge-type" style={{ background: 'var(--surf)' }}>Live</span>
              <b>{VEHICLES.length} vehicles</b> ready across Delhi NCR
            </span>
            <h1 className="h-xl">The vehicle you need is <em>already parked nearby.</em></h1>
            <p className="hero-sub">
              Cars, bikes, scooters and cycles rented straight from the people who own them
              in Delhi, Noida and Gurgaon. Book by the hour, unlock with a QR code, ride.
            </p>

            <div className="row row-gap-12" style={{ marginTop: 30, flexWrap: 'wrap' }}>
              <Link to="/search" className="btn btn-accent btn-lg">Browse vehicles<ArrowR size={17} /></Link>
              <Link to="/owner" className="btn btn-lg" style={{ color: '#fff', border: '1px solid rgba(255,255,255,.24)' }}>
                Earn from yours
              </Link>
            </div>

            <div className="hero-stats">
              {[['11', 'Vehicles live'], ['3', 'NCR cities'], ['₹25', 'From, per hour'], ['4.7', 'Average rating']]
                .map(([n, l]) => (
                  <div key={l}>
                    <div className="hero-stat-n">{n}</div>
                    <div className="hero-stat-l">{l}</div>
                  </div>
                ))}
            </div>
          </div>

          <div className="hero-art">
            <div className="hero-art-card">
              <div className="hero-art-media"><VehicleArt vehicle={hero} variant={1} /></div>
              <div className="hero-art-row">
                <div>
                  <div className="hero-art-name">{hero.name}</div>
                  <div className="hero-art-loc">{hero.area}, {hero.city} · {hero.distance} km away</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="hero-art-price">{inr(hero.daily)}</div>
                  <div className="hero-art-loc">per day</div>
                </div>
              </div>
              <div style={{ marginTop: 12, paddingInline: 4 }}><Plate vehicle={hero} /></div>
            </div>
            <div className="unlock-chip">
              <span className="logo-mark" style={{ background: 'var(--plate)', width: 32, height: 32, borderRadius: 9 }}>
                <Key size={16} style={{ color: 'var(--ink)' }} />
              </span>
              <div>
                <div className="unlock-chip-t">QR unlock ready</div>
                <div className="unlock-chip-s">Pickup in 12 minutes</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- search console */}
      <div className="wrap-wide console-wrap">
        <form className="console" onSubmit={runSearch}>
          <label className="console-cell">
            <span className="field-label"><Pin size={11} style={{ display: 'inline', verticalAlign: -1 }} /> Pick-up city</span>
            <select className="input input-bare" value={city} onChange={(e) => setCity(e.target.value)}>
              {CITIES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="console-cell">
            <span className="field-label">Pick-up date</span>
            <input className="input input-bare" type="date" value={from}
              min={isoKey(today())} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="console-cell">
            <span className="field-label">Return date</span>
            <input className="input input-bare" type="date" value={to}
              min={from} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="console-go">
            <button type="submit" className="btn btn-primary btn-lg">
              <SearchIcon size={17} />Search
            </button>
          </div>
        </form>
        <div className="console-hint">
          <span className="tiny">Popular right now</span>
          {['Royal Enfield', 'Automatic car', 'Electric scooter', 'Weekend cycle'].map((q) => (
            <Link key={q} to="/search" className="badge badge-surf" style={{ padding: '5px 12px' }}>{q}</Link>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------ how it works */}
      <section className="section" id="how">
        <div className="wrap-wide">
          <div className="section-head">
            <span className="eyebrow">How renting works</span>
            <h2 className="h-lg" style={{ marginTop: 12 }}>Three steps between you and the keys.</h2>
            <p className="lede" style={{ marginTop: 12 }}>
              No branch visits, no deposits held for weeks, no paperwork queue at a counter.
            </p>
          </div>
          <div className="steps">
            {STEPS.map((s) => (
              <article className="step" key={s.n}>
                <div className="step-n">{s.n}</div>
                <div className="step-icon"><s.icon size={21} /></div>
                <h3>{s.h}</h3>
                <p className="small" style={{ lineHeight: 1.6 }}>{s.p}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------- type + listings */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap-wide">
          <div className="results-head" style={{ marginBottom: 26 }}>
            <div>
              <span className="eyebrow">Browse by type</span>
              <h2 className="h-lg" style={{ marginTop: 12 }}>Four ways to get across the city.</h2>
            </div>
            <Link to="/search" className="btn btn-ghost">See all {VEHICLES.length}<ArrowR size={16} /></Link>
          </div>

          <div className="tabs" role="tablist" style={{ marginBottom: 26, width: 'fit-content' }}>
            {TYPES.map((t) => {
              const Ic = TYPE_ICON[t.id];
              return (
                <button key={t.id} role="tab" aria-selected={tab === t.id}
                  className={`tab ${tab === t.id ? 'tab-on' : ''}`} onClick={() => setTab(t.id)}>
                  <Ic size={17} />{t.label}
                  <span className="tab-count">{counts[t.id]}</span>
                </button>
              );
            })}
          </div>

          <div className="grid-cards">
            {shown.map((v) => <VehicleCard key={v.id} vehicle={v} />)}
          </div>
        </div>
      </section>

      {/* --------------------------------------------------------- trust band */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="wrap-wide">
          <div className="band">
            <div className="band-grid">
              {TRUST.map((t) => (
                <div className="band-item" key={t.h}>
                  <t.icon size={22} style={{ color: 'var(--plate)', marginBottom: 14 }} />
                  <h4>{t.h}</h4>
                  <p>{t.p}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
