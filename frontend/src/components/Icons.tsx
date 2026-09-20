import type { ComponentType, ReactNode, SVGProps } from 'react';
import type { VehicleType } from '../types';

/** Line icons, 24x24 grid, inherit currentColor. */
export type IconProps = SVGProps<SVGSVGElement> & { size?: number; sw?: number };

const S = ({ children, size = 18, sw = 1.7, fill = 'none', ...rest }: IconProps & { children?: ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor"
    strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
    {children}
  </svg>
);

export const Search = (p: IconProps) => <S {...p}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></S>;
export const Pin = (p: IconProps) => <S {...p}><path d="M12 21s7-5.5 7-11a7 7 0 10-14 0c0 5.5 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></S>;
export const Calendar = (p: IconProps) => <S {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M8 3v4M16 3v4M3 10h18" /></S>;
export const Clock = (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" /></S>;
export const ChevL = (p: IconProps) => <S {...p}><path d="M14.5 5L8 12l6.5 7" /></S>;
export const ChevR = (p: IconProps) => <S {...p}><path d="M9.5 5L16 12l-6.5 7" /></S>;
export const ChevD = (p: IconProps) => <S {...p}><path d="M5 9.5L12 16l7-6.5" /></S>;
export const ArrowR = (p: IconProps) => <S {...p}><path d="M4 12h15M13 6l6 6-6 6" /></S>;
export const Check = (p: IconProps) => <S {...p}><path d="M4.5 12.5l5 5 10-11" /></S>;
export const Shield = (p: IconProps) => <S {...p}><path d="M12 3l7.5 3v6c0 4.5-3.2 8-7.5 9-4.3-1-7.5-4.5-7.5-9V6z" /><path d="M9 12l2 2 4-4.5" /></S>;
export const Key = (p: IconProps) => <S {...p}><circle cx="8" cy="16" r="3.5" /><path d="M10.5 13.5L20 4M17 7l2.5 2.5M14.5 9.5L17 12" /></S>;
export const Zap = (p: IconProps) => <S {...p}><path d="M13 2.5L5 13.5h6l-1 8 8-11h-6z" /></S>;
export const Users = (p: IconProps) => <S {...p}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" /><path d="M17 5.5a3.2 3.2 0 010 6M18.5 20c0-2.2-.7-3.9-1.9-5" /></S>;
export const Fuel = (p: IconProps) => <S {...p}><path d="M4 20V6a2 2 0 012-2h5a2 2 0 012 2v14" /><path d="M3 20h11" /><path d="M13 10h3.5a1.5 1.5 0 011.5 1.5V16a2 2 0 004 0V9l-3-3" /><path d="M5 9h7" /></S>;
export const Gauge = (p: IconProps) => <S {...p}><path d="M3.5 18a9 9 0 1117 0" /><path d="M12 14l4-4" /><circle cx="12" cy="14.5" r="1.4" fill="currentColor" stroke="none" /></S>;
export const Cog = (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1M18.7 18.7l-2.1-2.1M7.4 7.4L5.3 5.3" /></S>;
export const Route = (p: IconProps) => <S {...p}><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18h5a3.5 3.5 0 000-7h-3a3.5 3.5 0 010-7h1" /></S>;
export const Wallet = (p: IconProps) => <S {...p}><path d="M3 7.5A2.5 2.5 0 015.5 5H18a2 2 0 012 2v1" /><rect x="3" y="7.5" width="18" height="12.5" rx="2.5" /><circle cx="16.5" cy="14" r="1.3" fill="currentColor" stroke="none" /></S>;
export const Trend = (p: IconProps) => <S {...p}><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></S>;
export const Sliders = (p: IconProps) => <S {...p}><path d="M4 7h9M18 7h2M4 17h3M12 17h8" /><circle cx="15.5" cy="7" r="2.2" /><circle cx="9.5" cy="17" r="2.2" /></S>;
export const Star = ({ size = 16, filled = true, ...r }: IconProps & { filled?: boolean }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" {...r}>
    <path d="M12 3.2l2.7 5.6 6 .9-4.35 4.3 1.03 6.1L12 17.2l-5.38 2.9 1.03-6.1L3.3 9.7l6-.9z" />
  </svg>
);
export const Menu = (p: IconProps) => <S {...p}><path d="M4 7h16M4 12h16M4 17h16" /></S>;
export const X = (p: IconProps) => <S {...p}><path d="M6 6l12 12M18 6L6 18" /></S>;
export const Lock = (p: IconProps) => <S {...p}><rect x="4.5" y="10" width="15" height="10.5" rx="2.5" /><path d="M8 10V7.5a4 4 0 018 0V10" /></S>;
export const Phone = (p: IconProps) => <S {...p}><rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10.5 18.5h3" /></S>;
export const Card = (p: IconProps) => <S {...p}><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /><path d="M6 15h3" /></S>;
export const Bank = (p: IconProps) => <S {...p}><path d="M3 9.5L12 4l9 5.5" /><path d="M5 10v8M10 10v8M14 10v8M19 10v8M3 20.5h18" /></S>;
export const Sparkle = (p: IconProps) => <S {...p}><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" /></S>;
export const Info = (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.9" r="1" fill="currentColor" stroke="none" /></S>;
export const Alert = (p: IconProps) => <S {...p}><path d="M12 4l8.5 15h-17z" /><path d="M12 10v4" /><circle cx="12" cy="16.6" r="1" fill="currentColor" stroke="none" /></S>;
export const Plus = (p: IconProps) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const Wrench = (p: IconProps) => <S {...p}><path d="M14.5 3.5a5.5 5.5 0 00-6.7 7.1L3 15.4 8.6 21l4.8-4.8a5.5 5.5 0 007.1-6.7l-3.2 3.2-3-.6-.6-3z" /></S>;
export const Bolt = (p: IconProps) => <S {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12.8 7.5L9.5 12.6h3l-.7 3.9 3.3-5.1h-3z" /></S>;
export const Camera = (p: IconProps) => <S {...p}><path d="M3 8.5h3l1.5-2.5h9L18 8.5h3a1 1 0 011 1V19a1 1 0 01-1 1H3a1 1 0 01-1-1V9.5a1 1 0 011-1z" /><circle cx="12" cy="13.5" r="3.5" /></S>;
export const Doc = (p: IconProps) => <S {...p}><path d="M6 2.5h7L19 8v13.5H6z" /><path d="M13 2.5V8h6" /><path d="M9 13h7M9 17h5" /></S>;
export const Headset = (p: IconProps) => <S {...p}><path d="M4 14v-2a8 8 0 1116 0v2" /><rect x="2.5" y="13.5" width="4" height="6" rx="1.6" /><rect x="17.5" y="13.5" width="4" height="6" rx="1.6" /><path d="M19.5 19.5v.5a3 3 0 01-3 3H13" /></S>;

/* vehicle-type glyphs */
export const CarIcon = (p: IconProps) => <S {...p}><path d="M4 15.5V12l2-4.5h12L20 12v3.5" /><path d="M2.5 15.5h19" /><circle cx="7" cy="17.5" r="2" /><circle cx="17" cy="17.5" r="2" /><path d="M6.2 12h11.6" /></S>;
export const BikeIcon = (p: IconProps) => <S {...p}><circle cx="5" cy="16.5" r="3.5" /><circle cx="19" cy="16.5" r="3.5" /><path d="M5 16.5l3-6h5l3 6" /><path d="M8 10.5h6" /><path d="M13.5 10.5L16 7h2.5" /></S>;
export const ScooterIcon = (p: IconProps) => <S {...p}><circle cx="5.5" cy="17" r="3" /><circle cx="18.5" cy="17" r="3" /><path d="M8.5 17h7" /><path d="M15.5 17l-1.5-9h-3" /><path d="M14 8h2.5l2 9" /><path d="M6 13.5h5" /></S>;
export const BicycleIcon = (p: IconProps) => <S {...p}><circle cx="5.5" cy="16.5" r="3.5" /><circle cx="18.5" cy="16.5" r="3.5" /><path d="M5.5 16.5l4-8h4l-3.5 8h8.5" /><path d="M9.5 8.5h3.5" /><path d="M13.5 8.5L16 12" /></S>;

export const TYPE_ICON: Readonly<Record<VehicleType, ComponentType<IconProps>>> = { car: CarIcon, bike: BikeIcon, scooter: ScooterIcon, bicycle: BicycleIcon };
