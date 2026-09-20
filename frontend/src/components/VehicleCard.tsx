import type { ComponentType } from 'react';
import { Link } from 'react-router-dom';
import VehicleArt from './VehicleArt';
import { Plate, Rating } from './Bits';
import { Bolt, Cog, Fuel, Gauge, Pin, Route, TYPE_ICON, Users, Wallet, Wrench, Zap } from './Icons';
import { inr } from '../lib/pricing';
import { specChips } from '../lib/specs';
import { TYPES } from '../data/seed';
import type { IconProps } from './Icons';
import type { Demand, Vehicle } from '../types';

const CHIP_ICONS: Readonly<Record<string, ComponentType<IconProps>>> = { users: Users, fuel: Fuel, cog: Cog, bolt: Bolt, gauge: Gauge, route: Route, zap: Zap, wallet: Wallet, wrench: Wrench };

export default function VehicleCard({
  vehicle: v,
  lit,
  onHover,
  demand,
}: {
  vehicle: Vehicle;
  lit?: boolean;
  onHover?: (id: string | null) => void;
  demand?: Demand;
}) {
  const TypeIcon = TYPE_ICON[v.type];
  const typeLabel = TYPES.find((t) => t.id === v.type)?.one ?? v.type;

  return (
    <Link
      to={`/vehicle/${v.id}`}
      className={`vcard ${lit ? 'vcard-lit' : ''}`}
      onMouseEnter={() => onHover?.(v.id)}
      onMouseLeave={() => onHover?.(null)}
    >
      <div className="vcard-media">
        <VehicleArt vehicle={v} variant={0} />
        <div className="vcard-top">
          <span className="badge badge-type"><TypeIcon size={13} />{typeLabel}</span>
          {v.ev && <span className="badge badge-ev"><Zap size={12} />EV</span>}
          {demand != null && demand.mult > 1 && !v.ev && <span className="badge badge-demand">{demand.mult}x</span>}
        </div>
        <div className="vcard-bot">
          <Plate vehicle={v} size="sm" />
        </div>
      </div>

      <div className="vcard-body">
        <div>
          <div className="vcard-title">{v.name}</div>
          <div className="vcard-meta" style={{ marginTop: 5 }}>
            <Pin size={13} style={{ color: 'var(--surf)' }} />
            {v.area}, {v.city}
            <span style={{ color: 'var(--line)' }}>·</span>
            <span className="mono" style={{ fontSize: 12 }}>{v.distance} km away</span>
          </div>
        </div>

        <div className="vcard-specs">
          {specChips(v).map((c) => {
            const Ic = (c.icon ? CHIP_ICONS[c.icon] : undefined) ?? Cog;
            return (
              <span key={c.key} className="spec-pill">
                <Ic size={12} style={{ color: 'var(--muted-2)' }} />{c.text}
              </span>
            );
          })}
        </div>

        <div className="vcard-foot">
          <div>
            <div className="price-day">{inr(v.daily)}<span className="price-unit"> /day</span></div>
            <div className="price-hr">{inr(v.hourly)}/hour</div>
          </div>
          <Rating value={v.rating} count={v.reviews} />
        </div>
      </div>
    </Link>
  );
}
