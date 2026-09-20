import { useNavigate } from 'react-router-dom';
import type { Vehicle } from '../types';
import { inrShort } from '../lib/pricing';

/**
 * Schematic map of Delhi NCR, drawn by hand rather than pulled from a tile
 * server — it renders instantly, works with no network during a demo, and
 * carries the brand palette. Pins are live: hovering one lights its card and
 * clicking one opens the vehicle.
 */

const DISTRICTS = [
  { label: 'NEW DELHI', x: 158, y: 208 },
  { label: 'NOIDA', x: 324, y: 296 },
  { label: 'GURGAON', x: 84, y: 366 },
  { label: 'FARIDABAD', x: 254, y: 586 },
];

const BLOCKS = [
  [130, 248], [214, 236], [166, 276], [238, 288], [120, 330], [220, 344],
  [154, 384], [252, 400], [98, 282], [274, 320], [292, 402], [136, 470],
  [90, 384], [316, 356], [178, 452], [266, 486], [110, 520], [306, 500],
  [200, 540], [242, 552], [148, 556], [318, 262],
];

export default function MapPanel({
  vehicles,
  litId,
  onHoverPin,
  className,
}: {
  vehicles: readonly Vehicle[];
  litId?: string | null;
  onHoverPin?: (id: string | null) => void;
  className?: string;
}) {
  const navigate = useNavigate();

  return (
    <div className={`map-shell ${className ?? ''}`}>
      <svg viewBox="0 0 400 700" className="map-svg" preserveAspectRatio="xMidYMid slice"
        role="img" aria-label="Map of available vehicles across Delhi NCR">
        <defs>
          <linearGradient id="mapbase" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#EDF3F4" /><stop offset="100%" stopColor="#E1EAEC" />
          </linearGradient>
          <filter id="pinshadow" x="-40%" y="-40%" width="180%" height="200%">
            <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0B1622" floodOpacity=".3" />
          </filter>
        </defs>

        <rect width="400" height="700" fill="url(#mapbase)" />

        {/* green belts — the Ridge and the Aravalli tail */}
        <ellipse cx="150" cy="286" rx="27" ry="48" fill="#DDEADF" />
        <ellipse cx="126" cy="452" rx="58" ry="46" fill="#DDEADF" />
        <ellipse cx="332" cy="608" rx="46" ry="32" fill="#DDEADF" />

        {/* the Yamuna */}
        <path d="M 228 -20 C 244 90 226 160 250 236 C 272 306 254 380 278 470 C 296 542 286 610 302 720"
          stroke="#C3DCE5" strokeWidth="16" fill="none" strokeLinecap="round" />
        <path d="M 228 -20 C 244 90 226 160 250 236 C 272 306 254 380 278 470 C 296 542 286 610 302 720"
          stroke="#D9EBF1" strokeWidth="7" fill="none" strokeLinecap="round" />

        {/* urban grain */}
        <g fill="#0B1622" opacity=".045">
          {BLOCKS.map(([x, y], i) => (
            <rect key={i} x={x} y={y} width={i % 3 === 0 ? 24 : 16} height={i % 4 === 0 ? 13 : 20} rx="3" />
          ))}
        </g>

        {/* arterial roads */}
        <g stroke="#CFD9DD" strokeWidth="6" fill="none" strokeLinecap="round">
          <path d="M 192 -20 L 188 190" />
          <path d="M 152 400 L 100 480" />
          <path d="M 240 338 L 310 352" />
          <path d="M 306 350 L 332 476" />
          <path d="M 186 412 L 216 606" />
          <path d="M 96 300 L -10 288" />
          <path d="M 268 214 L 340 176" />
        </g>

        {/* Ring Road */}
        <path d="M 188 190 C 244 190 280 238 280 300 C 280 364 240 412 188 412 C 136 412 96 364 96 300 C 96 238 132 190 188 190 Z"
          stroke="#C9D4D9" strokeWidth="7" fill="none" />
        <path d="M 188 190 C 244 190 280 238 280 300 C 280 364 240 412 188 412 C 136 412 96 364 96 300 C 96 238 132 190 188 190 Z"
          stroke="#F4C430" strokeWidth="1.4" fill="none" strokeDasharray="3 7" opacity=".55" />

        {/* metro corridor */}
        <path d="M 118 236 L 204 312 L 300 372" stroke="#11889B" strokeWidth="1.8"
          strokeDasharray="7 6" fill="none" opacity=".45" />

        {DISTRICTS.map((d) => (
          <text key={d.label} x={d.x} y={d.y} textAnchor="middle" fill="#8398A2"
            style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '.18em', fontWeight: 500 }}>
            {d.label}
          </text>
        ))}

        {/* the renter's location */}
        <g>
          <circle cx="196" cy="322" r="6" fill="#11889B" opacity=".25" className="map-ping" />
          <circle cx="196" cy="322" r="6.5" fill="#11889B" stroke="#fff" strokeWidth="2.5" />
        </g>

        {/* vehicle pins */}
        {vehicles.map((v) => {
          const label = inrShort(v.daily);
          const w = 15 + label.length * 6.2;
          const lit = litId === v.id;
          return (
            <g key={v.id} className={`map-pin ${lit ? 'map-pin-lit' : ''}`}
              transform={`translate(${v.map.x} ${v.map.y})`}
              onMouseEnter={() => onHoverPin?.(v.id)}
              onMouseLeave={() => onHoverPin?.(null)}
              onClick={() => navigate(`/vehicle/${v.id}`)}
              role="button" tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && navigate(`/vehicle/${v.id}`)}
              aria-label={`${v.name}, ${inrShort(v.daily)} per day`}>
              <g filter="url(#pinshadow)">
                <path d="M -4.5 0 L 0 5 L 4.5 0 Z" className="map-pin-body" fill="#0B1622" />
                <rect x={-w / 2} y="-19" width={w} height="19" rx="9.5" className="map-pin-body" fill="#0B1622" />
              </g>
              <text x="0" y="-6" textAnchor="middle" className="map-pin-price">{label}</text>
            </g>
          );
        })}
      </svg>

      <div className="map-you">
        <i className="dot dot-pulse" style={{ background: '#37C2C8' }} />
        You are here · Delhi
      </div>

      <div className="map-legend">
        <span className="map-legend-row"><i className="dot" style={{ background: '#0B1622' }} />{vehicles.length} vehicles nearby</span>
        <span className="map-legend-row"><i className="dot" style={{ background: '#F4C430' }} />Hover a pin to match the card</span>
      </div>
    </div>
  );
}
