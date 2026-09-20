import type { ReactElement } from 'react';
import { Star } from './Icons';
import type { BookingStatus, Vehicle, VehicleStatus } from '../types';

/**
 * Registration plate. Indian self-drive rentals run black plates with yellow
 * characters; bicycles have no RTO plate, so they carry a RentAny asset tag.
 */
export function Plate({ vehicle, size = 'md' }: { vehicle: Vehicle; size?: 'sm' | 'md' | 'lg' }) {
  const p = vehicle.plate;
  const cls = ['plate', p.tag && 'plate-tag', size === 'sm' && 'plate-sm', size === 'lg' && 'plate-lg']
    .filter(Boolean).join(' ');
  return (
    <span className={cls} title={p.tag ? 'RentAny asset tag' : 'Registration number'}>
      <span className="plate-ind">{p.tag ? 'RA' : 'IND'}</span>
      {p.tag ? `${p.series} ${p.num}` : `${p.code} ${p.series} ${p.num}`}
    </span>
  );
}

export function Rating({ value, count, size = 14 }: { value: number; count?: number; size?: number }) {
  return (
    <span className="rating">
      <Star size={size} style={{ color: '#F0A500' }} />
      {value.toFixed(1)}
      {count != null && <span className="rating-count">({count})</span>}
    </span>
  );
}

/** Read-only or interactive star row. */
export function Stars({ value = 0, onRate, size = 17 }: { value?: number; onRate?: (n: number) => void; size?: number }) {
  if (!onRate) {
    return (
      <span className="stars" aria-label={`${value} out of 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <Star key={n} size={size} filled={n <= value} style={{ color: n <= value ? '#F0A500' : '#C9D3D8' }} />
        ))}
      </span>
    );
  }
  return (
    <span className="stars">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className="star" onClick={() => onRate(n)}
          aria-label={`Rate ${n} star${n > 1 ? 's' : ''}`}>
          <Star size={size} filled={n <= value} style={{ color: n <= value ? '#F0A500' : '#C9D3D8' }} />
        </button>
      ))}
    </span>
  );
}

const STATUS: Readonly<Record<string, readonly [cls: string, label: string]>> = {
  available:   ['badge-good', 'Available'],
  rented:      ['badge-surf', 'On rent'],
  maintenance: ['badge-warn', 'Maintenance'],
  ongoing:     ['badge-surf', 'Ongoing'],
  upcoming:    ['badge-good', 'Upcoming'],
  completed:   ['badge-good', 'Completed'],
  past:        ['badge-surf', 'Completed'],
  cancelled:   ['badge-bad', 'Cancelled'],
};

export function StatusPill({ status }: { status: BookingStatus | VehicleStatus | string }) {
  const [cls, label] = STATUS[status] ?? ['badge-surf', status];
  return <span className={`badge ${cls}`}><i className={`dot ${status === 'ongoing' ? 'dot-pulse' : ''}`} />{label}</span>;
}

const Finder = ({ x, y }: { x: number; y: number }) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width="7" height="7" fill="#F4C430" />
    <rect x="1" y="1" width="5" height="5" fill="#0B1622" />
    <rect x="2" y="2" width="3" height="3" fill="#F4C430" />
  </g>
);

/** Deterministic QR-ish matrix — a placeholder that still reads as a real code. */
export function QRCode({ text, size = 132 }: { text: string; size?: number }) {
  const N = 21;
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  const bit = (i: number): boolean => {
    let x = h ^ Math.imul(i + 1, 2654435761);
    x ^= x >>> 15; x = Math.imul(x, 2246822519); x ^= x >>> 13;
    return (x >>> 0) % 100 < 47;
  };
  const isFinder = (r: number, c: number): boolean =>
    (r < 7 && c < 7) || (r < 7 && c > N - 8) || (r > N - 8 && c < 7);
  const cells: ReactElement[] = [];
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (isFinder(r, c)) continue;
      if (bit(r * N + c)) cells.push(<rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" />);
    }
  }
  return (
    <svg width={size} height={size} viewBox={`-1 -1 ${N + 2} ${N + 2}`} role="img" aria-label={`QR code for ${text}`}>
      <rect x="-1" y="-1" width={N + 2} height={N + 2} fill="#0B1622" />
      <g fill="#F4C430">{cells}</g>
      <Finder x={0} y={0} /><Finder x={N - 7} y={0} /><Finder x={0} y={N - 7} />
    </svg>
  );
}

export function Divider({ label }: { label?: string }) {
  if (!label) return <hr style={{ border: 0, borderTop: '1px solid var(--line)', margin: '18px 0' }} />;
  return (
    <div className="row row-gap-12" style={{ margin: '18px 0' }}>
      <span className="eyebrow eyebrow-muted">{label}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--line)' }} />
    </div>
  );
}
