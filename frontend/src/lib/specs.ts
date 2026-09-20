import type { SpecChip, SpecRow, Vehicle, VehicleType } from '../types';

/** Spec labels and per-type chip selection, so each vehicle shows what matters for it. */

const LABELS: Readonly<Record<string, string>> = {
  seats: 'Seats', fuel: 'Fuel', transmission: 'Gearbox', mileage: 'Mileage',
  boot: 'Boot space', year: 'Model year', range: 'Range', charge: 'Charge time',
  drive: 'Drivetrain', engine: 'Engine', power: 'Power', kerb: 'Kerb weight',
  storage: 'Under-seat', gears: 'Gears', frame: 'Frame', brakes: 'Brakes',
  wheel: 'Wheel size', weight: 'Weight', suspension: 'Suspension', carrier: 'Carrier',
};

/** Full spec table for the detail page — seed order is already meaningful. */
export function specRows(vehicle: Vehicle): SpecRow[] {
  return Object.entries(vehicle.specs).map(([k, v]) => ({
    key: k,
    label: LABELS[k] || k,
    value: k === 'seats' ? `${v} seats` : k === 'gears' ? `${v}-speed` : String(v),
  }));
}

/** Three chips per card. Which three depends on the vehicle type. */
const CHIP_KEYS: Readonly<Record<VehicleType, readonly string[]>> = {
  car: ['seats', 'fuel', 'transmission'],
  bike: ['engine', 'power', 'mileage'],
  scooter: ['engine', 'range', 'mileage', 'storage'],
  bicycle: ['gears', 'brakes', 'frame'],
};

const CHIP_ICON: Readonly<Record<string, string>> = {
  seats: 'users', fuel: 'fuel', transmission: 'cog', engine: 'bolt', power: 'gauge',
  mileage: 'route', range: 'zap', storage: 'wallet', gears: 'cog', brakes: 'gauge', frame: 'wrench',
};

export function specChips(vehicle: Vehicle): SpecChip[] {
  const keys = CHIP_KEYS[vehicle.type] ?? [];
  return keys
    .filter((k) => vehicle.specs[k] != null)
    .slice(0, 3)
    .map((k) => ({
      key: k,
      icon: CHIP_ICON[k],
      text: k === 'seats' ? `${vehicle.specs[k]} seats`
        : k === 'gears' ? `${vehicle.specs[k]} gears`
        : String(vehicle.specs[k]),
    }));
}

/** Which single spec headlines a compact row (dashboards, summaries). */
export function headlineSpec(vehicle: Vehicle): string {
  const s = vehicle.specs;
  if (vehicle.type === 'car') return `${s.seats} seats · ${s.fuel} · ${s.transmission}`;
  if (vehicle.type === 'bicycle') return `${s.gears} gears · ${s.frame}`;
  return `${s.engine} · ${s.range ?? s.mileage}`;
}
