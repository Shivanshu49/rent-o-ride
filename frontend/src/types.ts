/**
 * Shapes the UI renders.
 *
 * One deliberate wart: amounts here are whole RUPEES, because the prototype's
 * seed data is. The API speaks integer paise (see @ror/shared/money), so as each
 * phase wires a screen to the real API the type it uses moves to Paise and the
 * seed entry behind it goes away. Anything still typed `number` and named like
 * money below is therefore a to-do list of screens not yet on the API.
 */

export type VehicleType = 'car' | 'bike' | 'scooter' | 'bicycle';
export type VehicleStatus = 'available' | 'rented' | 'maintenance';
export type BookingStatus = 'upcoming' | 'ongoing' | 'completed' | 'past';

export interface TypeTab {
  readonly id: VehicleType;
  readonly label: string;
  readonly one: string;
  readonly icon: string;
}

export interface Owner {
  readonly id: string;
  readonly name: string;
  readonly initials: string;
  readonly rating: number;
  readonly trips: number;
  readonly since: string;
  readonly responds: string;
  readonly verified: boolean;
}

export interface Renter {
  readonly name: string;
  readonly initials: string;
  readonly since: string;
  readonly trips: number;
  readonly rating: number;
}

export interface Plate {
  readonly code: string;
  readonly series: string;
  readonly num: string;
  /** Bicycles carry no RTO plate in India, so they get an asset tag instead. */
  readonly tag?: boolean;
}

/** Inclusive day-offsets from today: [2, 4] blocks three days. */
export type BookedRange = readonly [from: number, to: number];

export interface Vehicle {
  readonly id: string;
  readonly type: VehicleType;
  readonly name: string;
  readonly tagline: string;
  readonly ev?: boolean;
  readonly plate: Plate;
  readonly city: string;
  readonly area: string;
  readonly distance: number;
  readonly hourly: number;
  readonly daily: number;
  readonly rating: number;
  readonly reviews: number;
  readonly trips: number;
  readonly ownerId: string;
  readonly color: string;
  readonly accent: string;
  readonly map: { readonly x: number; readonly y: number };
  readonly specs: Readonly<Record<string, string | number>>;
  readonly features: readonly string[];
  readonly rules: string;
  readonly deposit: number;
  readonly booked: readonly BookedRange[];
}

export interface EarningsBar {
  readonly m: string;
  readonly v: number;
}

export interface OwnerBooking {
  readonly id: string;
  readonly vehicleId: string;
  readonly renter: string;
  readonly initials: string;
  /** Start, as a day-offset from today. Negative is in the past. */
  readonly days: number;
  readonly nights: number;
  readonly amount: number;
  readonly status: BookingStatus;
}

export interface RenterBooking {
  readonly id: string;
  readonly vehicleId: string;
  /** Start, as a day-offset from today. */
  readonly start: number;
  readonly nights: number;
  readonly amount: number;
  readonly status: BookingStatus;
  /** Stars the renter left, 0 when not yet rated. */
  readonly rated: number;
}

export interface Review {
  readonly by: string;
  readonly initials: string;
  readonly stars: number;
  readonly when: string;
  readonly text: string;
}

export interface Demand {
  readonly mult: number;
  readonly label: string;
}

export interface AdvanceDiscount {
  readonly rate: number;
  readonly label: string | null;
}

export interface Quote {
  readonly nights: number;
  readonly base: number;
  readonly demand: Demand;
  readonly surge: number;
  readonly fare: number;
  readonly daysAhead: number;
  readonly advance: AdvanceDiscount;
  readonly discount: number;
  readonly net: number;
  readonly fee: number;
  readonly gst: number;
  readonly total: number;
  readonly deposit: number;
  readonly payable: number;
}

/** The booking being assembled across dates -> pay -> confirm. */
export interface BookingDraft {
  readonly vehicleId: string;
  readonly start: Date;
  readonly end: Date;
  readonly nights: number;
  /** Pickup time, "HH:mm". */
  readonly slot: string;
}

export interface MadeBooking {
  readonly id: string;
  readonly vehicleId: string;
  readonly start: Date;
  readonly end: Date;
  readonly nights: number;
  readonly slot: string;
  readonly amount: number;
  readonly method: string;
  readonly madeAt: Date;
}

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly icon: string;
}

export interface SpecRow {
  readonly key: string;
  readonly label: string;
  readonly value: string;
}

export interface SpecChip {
  readonly key: string;
  readonly icon: string | undefined;
  readonly text: string;
}
