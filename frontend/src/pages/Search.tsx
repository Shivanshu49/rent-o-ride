import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import VehicleCard from '../components/VehicleCard';
import MapPanel from '../components/MapPanel';
import { Calendar as CalIcon, Check, Pin, Sliders, TYPE_ICON, X, Zap } from '../components/Icons';
import { CITIES, TYPES, VEHICLES } from '../data/seed';
import { fmtTiny } from '../lib/dates';
import { demandForRange, inr } from '../lib/pricing';
import { useStore } from '../state/store';
import type { Vehicle, VehicleType } from '../types';

type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'distance' | 'rating';

const SORTS: readonly (readonly [SortKey, string])[] = [
  ['recommended', 'Recommended'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
  ['distance', 'Nearest first'],
  ['rating', 'Top rated'],
];

const PRICE_MAX = 4500;
const DIST_MAX = 6;

export default function Search() {
  const [params] = useSearchParams();
  const { city, setCity } = useStore();

  const [types, setTypes] = useState<VehicleType[]>(() => {
    const t = params.get('type') as VehicleType | null;
    return t ? [t] : [];
  });
  const [cityFilter, setCityFilter] = useState(params.get('city') ?? city);
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX);
  const [maxDist, setMaxDist] = useState(DIST_MAX);
  const [evOnly, setEvOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('recommended');
  const [lit, setLit] = useState<string | null>(null);
  const [mapOpen, setMapOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const from = params.get('from');
  const to = params.get('to');

  useEffect(() => { if (cityFilter !== 'All NCR') setCity(cityFilter); }, [cityFilter, setCity]);

  const results = useMemo(() => {
    const out = VEHICLES.filter((v) =>
      (types.length === 0 || types.includes(v.type)) &&
      (cityFilter === 'All NCR' || v.city === cityFilter) &&
      v.daily <= maxPrice &&
      v.distance <= maxDist &&
      (!evOnly || v.ev)
    );
    const by: Record<SortKey, (a: Vehicle, b: Vehicle) => number> = {
      'price-asc': (a, b) => a.daily - b.daily,
      'price-desc': (a, b) => b.daily - a.daily,
      distance: (a, b) => a.distance - b.distance,
      rating: (a, b) => b.rating - a.rating,
      recommended: (a, b) => b.rating * 20 - b.distance - (a.rating * 20 - a.distance),
    };
    return [...out].sort(by[sort]);
  }, [types, cityFilter, maxPrice, maxDist, evOnly, sort]);

  const typeCounts = useMemo(() => {
    const base = VEHICLES.filter((v) => cityFilter === 'All NCR' || v.city === cityFilter);
    return Object.fromEntries(TYPES.map((t) => [t.id, base.filter((v) => v.type === t.id).length]));
  }, [cityFilter]);

  const demand = useMemo(
    () => (from ? demandForRange(new Date(from), 1) : null), [from]
  );

  const toggleType = (id: VehicleType): void =>
    setTypes((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id]));

  const reset = () => {
    setTypes([]); setMaxPrice(PRICE_MAX); setMaxDist(DIST_MAX); setEvOnly(false);
  };
  const activeCount = types.length + (maxPrice < PRICE_MAX ? 1 : 0) + (maxDist < DIST_MAX ? 1 : 0) + (evOnly ? 1 : 0);

  return (
    <div className="page wrap-wide">
      <div className="results-head">
        <div>
          <span className="eyebrow">Search results</span>
          <h1 className="h-lg" style={{ marginTop: 10 }}>
            {results.length} {results.length === 1 ? 'vehicle' : 'vehicles'} in {cityFilter}
          </h1>
          <div className="row row-gap-12" style={{ marginTop: 10, flexWrap: 'wrap' }}>
            {from && to && (
              <span className="badge badge-surf">
                <CalIcon size={13} />{fmtTiny(new Date(from))} — {fmtTiny(new Date(to))}
              </span>
            )}
            {demand != null && demand.mult > 1 && (
              <span className="badge badge-demand">{demand.label} · {demand.mult}x on these dates</span>
            )}
            <span className="small">Distances are measured from Connaught Place.</span>
          </div>
        </div>

        <div className="row row-gap-8" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm map-toggle" onClick={() => setMapOpen((o) => !o)}>
            <Pin size={15} />{mapOpen ? 'Hide map' : 'Show map'}
          </button>
          <button className="btn btn-ghost btn-sm" style={{ display: 'none' }} onClick={() => setFiltersOpen((o) => !o)}>
            <Sliders size={15} />Filters
          </button>
          <label className="row row-gap-8">
            <span className="tiny">Sort</span>
            <select className="input" style={{ width: 'auto', paddingBlock: 8 }}
              value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div className="search-layout">
        {/* --------------------------------------------------------- filters */}
        <aside className={`filters ${filtersOpen ? 'filters-open' : ''}`} aria-label="Filters">
          <div className="row" style={{ justifyContent: 'space-between', paddingBottom: 4 }}>
            <span className="row row-gap-8" style={{ fontWeight: 700, fontFamily: 'var(--display)', letterSpacing: '-.02em' }}>
              <Sliders size={16} style={{ color: 'var(--surf)' }} />Filters
            </span>
            {activeCount > 0 && (
              <button className="btn btn-quiet btn-sm" onClick={reset}><X size={13} />Clear {activeCount}</button>
            )}
          </div>

          <div className="filter-block">
            <div className="filter-title">City</div>
            <div className="row row-gap-8" style={{ flexWrap: 'wrap' }}>
              {['All NCR', ...CITIES].map((c) => (
                <button key={c} onClick={() => setCityFilter(c)}
                  className={`badge ${cityFilter === c ? 'badge-type' : 'badge-surf'}`}
                  style={{ cursor: 'pointer', border: 'none', padding: '6px 12px' }}>
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-block">
            <div className="filter-title">Vehicle type</div>
            {TYPES.map((t) => {
              const Ic = TYPE_ICON[t.id];
              return (
                <label className="check" key={t.id}>
                  <input type="checkbox" checked={types.includes(t.id)} onChange={() => toggleType(t.id)} />
                  <span className="check-box"><Check size={12} style={{ color: '#fff' }} sw={3} /></span>
                  <Ic size={15} style={{ color: 'var(--muted-2)' }} />
                  {t.label}
                  <span className="check-n">{typeCounts[t.id]}</span>
                </label>
              );
            })}
          </div>

          <div className="filter-block">
            <div className="filter-title">Price per day</div>
            <input className="slider" type="range" min="249" max={PRICE_MAX} step="50"
              value={maxPrice} onChange={(e) => setMaxPrice(+e.target.value)} aria-label="Maximum price per day" />
            <div className="slider-val">
              <span>₹249</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>up to {inr(maxPrice)}</span>
            </div>
          </div>

          <div className="filter-block">
            <div className="filter-title">Distance from you</div>
            <input className="slider" type="range" min="0.5" max={DIST_MAX} step="0.1"
              value={maxDist} onChange={(e) => setMaxDist(+e.target.value)} aria-label="Maximum distance" />
            <div className="slider-val">
              <span>0.5 km</span>
              <span style={{ color: 'var(--ink)', fontWeight: 600 }}>within {maxDist.toFixed(1)} km</span>
            </div>
          </div>

          <div className="filter-block">
            <div className="filter-title">Fuel</div>
            <label className="check">
              <input type="checkbox" checked={evOnly} onChange={() => setEvOnly((e) => !e)} />
              <span className="check-box"><Check size={12} style={{ color: '#fff' }} sw={3} /></span>
              <Zap size={15} style={{ color: 'var(--muted-2)' }} />
              Electric only
              <span className="check-n">{VEHICLES.filter((v) => v.ev).length}</span>
            </label>
          </div>
        </aside>

        {/* --------------------------------------------------------- results */}
        <div>
          {results.length === 0 ? (
            <div className="empty">
              <h3 className="h-sm">Nothing matches those filters yet.</h3>
              <p className="small" style={{ margin: '8px 0 18px' }}>
                Widen the distance or raise the price cap to see more vehicles.
              </p>
              <button className="btn btn-primary" onClick={reset}>Clear filters</button>
            </div>
          ) : (
            <div className="grid-cards">
              {results.map((v) => (
                <VehicleCard key={v.id} vehicle={v} lit={lit === v.id} onHover={setLit} {...(demand ? { demand } : {})} />
              ))}
            </div>
          )}

          <div className="card card-pad" style={{ marginTop: 24, display: 'flex', gap: 16,
            alignItems: 'center', flexWrap: 'wrap', background: 'var(--wash)', borderColor: 'transparent' }}>
            <Zap size={20} style={{ color: 'var(--marine)' }} />
            <div style={{ flex: 1, minWidth: 220 }}>
              <div className="h-sm">Own something with wheels?</div>
              <p className="small">Owners on RentAny earn ₹18,000 a month on average from a single vehicle.</p>
            </div>
            <Link to="/owner" className="btn btn-primary btn-sm">Open owner dashboard</Link>
          </div>
        </div>

        {/* ------------------------------------------------------------- map */}
        <div className={`map-col ${mapOpen ? 'map-col-open' : ''}`}>
          <MapPanel vehicles={results} litId={lit} onHoverPin={setLit} />
        </div>
      </div>
    </div>
  );
}
