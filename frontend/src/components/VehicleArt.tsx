/**
 * Side-profile vehicle illustrations, drawn inline so the prototype needs no
 * image hosting and never shows a broken tile during a live demo.
 * Each vehicle is tinted from its own seed colours; `variant` swaps the scene
 * behind it so the detail-page gallery reads as four different shots.
 */

import type { Vehicle } from '../types';

const RIM = '#CBD5DA';
const TYRE = '#191E23';
const HUB = '#8C9AA3';

interface WheelProps { cx: number; cy: number; r: number; spokes?: number }

function Wheel({ cx: cx0, cy: cy0, r: r0, spokes = 5 }: WheelProps) {
  const cx = +cx0, cy = +cy0, r = +r0;
  const rim = r * 0.52;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TYRE} />
      <circle cx={cx} cy={cy} r={r * 0.78} fill="none" stroke="#2C343B" strokeWidth={r * 0.1} />
      <circle cx={cx} cy={cy} r={rim} fill={RIM} />
      {Array.from({ length: spokes }, (_, i) => {
        const a = (i / spokes) * Math.PI * 2 - Math.PI / 2;
        return (
          <line key={i} x1={cx} y1={cy} x2={cx + Math.cos(a) * rim * 0.92}
            y2={cy + Math.sin(a) * rim * 0.92} stroke="#9EAAB3" strokeWidth={r * 0.11} strokeLinecap="round" />
        );
      })}
      <circle cx={cx} cy={cy} r={r * 0.14} fill={HUB} />
    </g>
  );
}

function SpokedWheel({ cx: cx0, cy: cy0, r: r0 }: Omit<WheelProps, 'spokes'>) {
  const cx = +cx0, cy = +cy0, r = +r0;
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#20262B" strokeWidth="4.5" />
      <circle cx={cx} cy={cy} r={r - 5} fill="none" stroke="#AFBBC3" strokeWidth="2.2" />
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i / 16) * Math.PI * 2;
        return (
          <line key={i} x1={cx + Math.cos(a) * 5} y1={cy + Math.sin(a) * 5}
            x2={cx + Math.cos(a) * (r - 6)} y2={cy + Math.sin(a) * (r - 6)}
            stroke="#C2CCD3" strokeWidth="0.9" />
        );
      })}
      <circle cx={cx} cy={cy} r="5" fill="#7E8B94" />
    </g>
  );
}

/* ---------------------------------------------------------------- cars */
/** c = body colour, a = accent, both from the vehicle's own seed palette. */
interface BodyProps { c: string; a: string; suv?: boolean }

function Car({ c, a, suv }: BodyProps) {
  const geo = suv
    ? {
        body: `M 44 140 C 42 124 44 112 54 108 L 74 100
               C 78 72 92 58 118 56 L 190 56
               C 212 57 222 66 230 84 L 258 92
               C 270 95 278 102 278 114 L 278 136
               C 278 139 276 140 273 140 Z`,
        glassR: 'M 88 92 C 92 72 104 63 120 62 L 148 62 L 148 92 Z',
        glassF: 'M 154 62 L 188 62 C 202 63 210 70 218 90 L 154 90 Z',
        belt: 108, bb: 140, wy: 140, wr: 28, rx: 88, fx: 240, pillar: 151,
      }
    : {
        body: `M 46 138 C 44 124 46 114 56 110 L 78 100
               C 88 78 106 68 132 66 L 172 65
               C 192 66 204 74 214 88 L 252 96
               C 266 99 274 106 274 118 L 274 134
               C 274 137 272 138 269 138 Z`,
        glassR: 'M 92 96 C 100 80 114 72 132 71 L 152 71 L 152 96 Z',
        glassF: 'M 158 71 L 172 71 C 186 72 196 79 204 95 L 158 95 Z',
        belt: 104, bb: 138, wy: 138, wr: 25, rx: 88, fx: 238, pillar: 155,
      };

  return (
    <g>
      <ellipse cx="160" cy={geo.wy + geo.wr + 4} rx="122" ry="9" fill="#0B1622" opacity=".16" />
      <path d={geo.body} fill={c} />
      <path d={geo.body} fill="url(#sheen)" opacity=".5" />

      {/* wheel wells */}
      <circle cx={geo.rx} cy={geo.wy} r={geo.wr + 5} fill="#0B1622" opacity=".2" />
      <circle cx={geo.fx} cy={geo.wy} r={geo.wr + 5} fill="#0B1622" opacity=".2" />

      {/* glass */}
      <path d={geo.glassR} fill="#1E303C" />
      <path d={geo.glassF} fill="#1E303C" />
      <path d={geo.glassR} fill="url(#glass)" opacity=".5" />
      <path d={geo.glassF} fill="url(#glass)" opacity=".5" />

      {/* creases, door shut line, handle */}
      <path d={`M 56 ${geo.belt + 14} L 268 ${geo.belt + 18}`} stroke="#fff" strokeOpacity=".22" strokeWidth="2" fill="none" />
      <path d={`M ${geo.pillar} ${geo.belt - 12} L ${geo.pillar - 2} ${geo.bb - 8}`} stroke="#0B1622" strokeOpacity=".2" strokeWidth="1.6" />
      <rect x={geo.pillar - 22} y={geo.belt + 6} width="15" height="3.6" rx="1.8" fill="#0B1622" opacity=".32" />
      <rect x={geo.pillar + 12} y={geo.belt + 6} width="15" height="3.6" rx="1.8" fill="#0B1622" opacity=".32" />

      {/* SUV cues: roof rails, wheel-arch cladding, side step */}
      {suv && <><rect x="104" y="52" width="80" height="4.5" rx="2.2" fill={a} />
        <rect x="112" y="132" width="118" height="7" rx="3" fill={a} /></>}

      {/* lamps and bumpers */}
      <path d={`M ${suv ? 266 : 262} ${geo.belt + 4} l 11 2 0 10 -11 1 z`} fill="#F8F3DE" opacity=".95" />
      <path d={`M ${suv ? 45 : 47} ${geo.belt + 8} l -3 1 0 11 3 1 z`} fill="#DA453C" opacity=".92" />
      <rect x={geo.fx + 8} y={geo.bb - 9} width="28" height="6" rx="3" fill="#2B343B" />
      <rect x="46" y={geo.bb - 9} width="24" height="6" rx="3" fill="#2B343B" />

      <Wheel cx={geo.rx} cy={geo.wy} r={geo.wr} />
      <Wheel cx={geo.fx} cy={geo.wy} r={geo.wr} />
    </g>
  );
}

/* ------------------------------------------------------------- bikes */
/* Wheels r=30 at (82,142) and (242,142); fenders are arcs concentric with them. */
function Bike({ c, a }: BodyProps) {
  return (
    <g>
      <ellipse cx="160" cy="180" rx="118" ry="8" fill="#0B1622" opacity=".16" />

      {/* mudguards hug their wheels */}
      <path d="M 48 136 A 34 34 0 0 1 114 130" stroke={c} strokeWidth="7.5" fill="none" strokeLinecap="butt" />
      <path d="M 213 125 A 34 34 0 0 1 271 125" stroke={c} strokeWidth="7.5" fill="none" strokeLinecap="butt" />

      {/* swingarm, shock, frame */}
      <path d="M 152 134 L 84 143" stroke="#39424A" strokeWidth="7" strokeLinecap="round" />
      <path d="M 146 106 L 120 138" stroke="#7E8A94" strokeWidth="4.5" strokeLinecap="round" />
      <g stroke={a} strokeWidth="5.5" strokeLinecap="round" fill="none">
        <path d="M 150 100 L 202 98" />
        <path d="M 202 100 L 188 130" />
        <path d="M 150 102 L 152 132" />
        <path d="M 150 102 L 104 105" />
      </g>

      {/* engine and pipe */}
      <path d="M 150 116 L 186 116 L 192 140 L 154 142 Z" fill="#2E363D" />
      <path d="M 155 120 L 181 120 L 184 131 L 158 132 Z" fill="#525E69" />
      <path d="M 186 134 C 168 141 142 144 116 142" stroke="#AFBBC3" strokeWidth="7" fill="none" strokeLinecap="round" />
      <path d="M 185 132 C 167 138 143 141 118 140" stroke="#E4EAEE" strokeWidth="2.2" fill="none" strokeLinecap="round" />

      {/* seat */}
      <path d="M 100 106 C 112 98 130 94 150 95 L 152 106 L 104 116 Z" fill="#161B20" />

      {/* fuel tank */}
      <path d="M 150 96 C 164 86 186 86 200 96 L 202 112 C 188 122 166 122 152 112 Z" fill={c} />
      <path d="M 150 96 C 164 86 186 86 200 96 L 202 112 C 188 122 166 122 152 112 Z" fill="url(#sheen)" opacity=".45" />

      {/* forks, lamp, bars */}
      <path d="M 204 94 L 238 140 M 212 92 L 246 138" stroke="#B0BCC4" strokeWidth="5.5" strokeLinecap="round" />
      <circle cx="204" cy="92" r="11" fill="#F8F3DE" stroke="#2A3238" strokeWidth="3" />
      <path d="M 196 78 L 226 72" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M 212 74 L 208 88" stroke="#2A3238" strokeWidth="4" strokeLinecap="round" />
      <path d="M 222 73 L 228 58" stroke="#2A3238" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="229" cy="55" rx="6.5" ry="4.5" fill="#9FAAB2" stroke="#2A3238" strokeWidth="2" />

      <Wheel cx={82} cy={142} r={30} spokes={6} />
      <Wheel cx={242} cy={142} r={30} spokes={6} />
    </g>
  );
}

/* ---------------------------------------------------------- scooters */
function Scooter({ c, a }: BodyProps) {
  return (
    <g>
      <ellipse cx="166" cy="188" rx="114" ry="8" fill="#0B1622" opacity=".16" />
      {/* rear body */}
      <path d="M 56 150 C 52 124 70 106 100 102 L 156 98 L 166 138 L 114 152 Z" fill={c} />
      <path d="M 56 150 C 52 124 70 106 100 102 L 156 98 L 166 138 L 114 152 Z" fill="url(#sheen)" opacity=".45" />
      <path d="M 58 108 L 82 102" stroke="#9AA5AD" strokeWidth="4.5" strokeLinecap="round" />
      {/* seat */}
      <path d="M 76 104 C 96 94 124 90 148 92 L 152 106 L 82 117 Z" fill="#161B20" />
      <path d="M 104 132 L 86 152" stroke="#3A434B" strokeWidth="6" strokeLinecap="round" />
      {/* floorboard */}
      <path d="M 158 136 L 214 138 L 214 150 L 160 148 Z" fill={a} />
      {/* leg shield */}
      <path d="M 208 146 L 216 98 C 218 84 230 76 242 78 L 252 84 L 248 146 Z" fill={c} />
      <path d="M 208 146 L 216 98 C 218 84 230 76 242 78 L 252 84 L 248 146 Z" fill="url(#sheen)" opacity=".4" />
      {/* fork + front fender */}
      <path d="M 242 110 L 252 150" stroke="#B4BFC7" strokeWidth="6" strokeLinecap="round" />
      <path d="M 226 139 A 27 27 0 0 1 274 145" stroke={c} strokeWidth="7.5" fill="none" strokeLinecap="butt" />
      {/* headlight */}
      <ellipse cx="240" cy="102" rx="9" ry="12" fill="#F8F3DE" stroke="#2A3238" strokeWidth="2.5" />
      {/* handlebar + mirror */}
      <path d="M 228 74 L 258 68" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M 248 70 L 254 52" stroke="#2A3238" strokeWidth="2.6" strokeLinecap="round" />
      <ellipse cx="255" cy="49" rx="6.5" ry="4.5" fill="#9FAAB2" stroke="#2A3238" strokeWidth="2" />
      <Wheel cx={86} cy={156} r={23} spokes={5} />
      <Wheel cx={250} cy={156} r={23} spokes={5} />
    </g>
  );
}

/* --------------------------------------------------------- bicycles */
function Bicycle({ c, a }: BodyProps) {
  return (
    <g>
      <ellipse cx="160" cy="180" rx="116" ry="7" fill="#0B1622" opacity=".14" />
      {/* frame */}
      <g stroke={c} strokeWidth="7" strokeLinecap="round" fill="none">
        <path d="M 78 140 L 156 140" />
        <path d="M 156 140 L 138 88" />
        <path d="M 156 140 L 208 86" />
        <path d="M 138 88 L 206 84" />
        <path d="M 138 88 L 80 140" />
        <path d="M 156 140 L 80 140" />
      </g>
      {/* fork */}
      <path d="M 208 86 L 242 140" stroke={a} strokeWidth="6" strokeLinecap="round" fill="none" />
      {/* head tube */}
      <path d="M 206 84 L 212 96" stroke={a} strokeWidth="8" strokeLinecap="round" />
      {/* seat post + saddle */}
      <path d="M 138 88 L 134 74" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M 120 72 C 128 66 142 66 148 71 L 146 77 C 136 74 128 76 122 78 Z" fill="#181D22" />
      {/* handlebar + stem */}
      <path d="M 208 80 L 214 70" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M 200 68 L 228 66" stroke="#2A3238" strokeWidth="5" strokeLinecap="round" />
      <path d="M 226 66 L 234 76" stroke="#2A3238" strokeWidth="4" strokeLinecap="round" />
      {/* drivetrain */}
      <circle cx="156" cy="140" r="13" fill="none" stroke="#8E9BA4" strokeWidth="3" />
      <circle cx="78" cy="140" r="7" fill="none" stroke="#8E9BA4" strokeWidth="2.5" />
      <path d="M 156 127 L 78 133 M 156 153 L 78 147" stroke="#6E7C86" strokeWidth="2.4" />
      <path d="M 156 140 L 166 152" stroke="#2A3238" strokeWidth="4" strokeLinecap="round" />
      <rect x="163" y="152" width="13" height="5" rx="2.5" fill="#2A3238" />
      <SpokedWheel cx={78} cy={140} r={40} />
      <SpokedWheel cx={242} cy={140} r={40} />
    </g>
  );
}

const SHAPES = { car: Car, bike: Bike, scooter: Scooter, bicycle: Bicycle };

/** Backdrops. 0 studio · 1 street · 2 dusk · 3 blueprint detail */
function Scene({ variant, uid }: { variant: number; uid: string }) {
  if (variant === 1) {
    return (
      <g>
        <rect width="320" height="200" fill={`url(#sky-${uid})`} />
        <g fill="#0B1622" opacity=".1">
          <rect x="6" y="52" width="34" height="108" /><rect x="44" y="76" width="24" height="84" />
          <rect x="74" y="40" width="30" height="120" /><rect x="112" y="66" width="20" height="94" />
          <rect x="196" y="58" width="28" height="102" /><rect x="230" y="82" width="22" height="78" />
          <rect x="258" y="46" width="34" height="114" /><rect x="296" y="72" width="20" height="88" />
        </g>
        <rect y="160" width="320" height="40" fill="#0B1622" opacity=".08" />
        <path d="M 0 182 H 320" stroke="#0B1622" strokeOpacity=".18" strokeWidth="2" strokeDasharray="16 12" />
      </g>
    );
  }
  if (variant === 2) {
    return (
      <g>
        <rect width="320" height="200" fill={`url(#dusk-${uid})`} />
        <circle cx="256" cy="56" r="30" fill="#F4C430" opacity=".28" />
        <circle cx="256" cy="56" r="16" fill="#F4C430" opacity=".42" />
        <rect y="164" width="320" height="36" fill="#0B1622" opacity=".14" />
      </g>
    );
  }
  if (variant === 3) {
    return (
      <g>
        <rect width="320" height="200" fill="#0E2A33" />
        <g stroke="#37C2C8" strokeOpacity=".16" strokeWidth="1">
          {Array.from({ length: 16 }, (_, i) => <line key={`v${i}`} x1={i * 20} y1="0" x2={i * 20} y2="200" />)}
          {Array.from({ length: 10 }, (_, i) => <line key={`h${i}`} x1="0" y1={i * 20} x2="320" y2={i * 20} />)}
        </g>
        <path d="M 20 176 H 300" stroke="#37C2C8" strokeOpacity=".5" strokeWidth="1" strokeDasharray="4 4" />
      </g>
    );
  }
  return (
    <g>
      <rect width="320" height="200" fill={`url(#studio-${uid})`} />
      <ellipse cx="160" cy="182" rx="150" ry="26" fill="#0B1622" opacity=".05" />
    </g>
  );
}

export default function VehicleArt({
  vehicle,
  variant = 0,
  className,
}: {
  vehicle: Vehicle;
  variant?: number;
  className?: string;
}) {
  const Shape = SHAPES[vehicle.type] || Car;
  const uid = `${vehicle.id}-${variant}`;
  const suv = Boolean(vehicle.specs?.drive) || /creta|thar|nexon/i.test(vehicle.name);
  const zoom = variant === 3;

  return (
    <svg viewBox="0 0 320 200" className={className} role="img"
      aria-label={`Illustration of ${vehicle.name}`} preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`studio-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FAFCFD" /><stop offset="62%" stopColor="#EDF2F4" /><stop offset="100%" stopColor="#DFE7EA" />
        </linearGradient>
        <linearGradient id={`sky-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#DCEEF2" /><stop offset="100%" stopColor="#F2F6F7" />
        </linearGradient>
        <linearGradient id={`dusk-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#20404E" /><stop offset="55%" stopColor="#4A6472" /><stop offset="100%" stopColor="#8FA3AC" />
        </linearGradient>
        <linearGradient id="sheen" x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity=".55" />
          <stop offset="45%" stopColor="#fff" stopOpacity=".05" />
          <stop offset="100%" stopColor="#000" stopOpacity=".18" />
        </linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8FD4DD" stopOpacity=".7" />
          <stop offset="100%" stopColor="#0B1622" stopOpacity=".1" />
        </linearGradient>
      </defs>
      <Scene variant={variant} uid={uid} />
      <g transform={zoom ? 'translate(-100 -46) scale(1.55)' : undefined}>
        <Shape c={vehicle.color} a={vehicle.accent} suv={suv} />
      </g>
    </svg>
  );
}
