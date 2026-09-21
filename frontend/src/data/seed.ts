import { toPaise } from '@ror/shared';
import type {
  EarningsBar,
  Owner,
  OwnerBooking,
  Renter,
  RenterBooking,
  Review,
  TypeTab,
  Vehicle,
  VehicleStatus,
} from '../types';

/**
 * RentAny seed data.
 * Everything the prototype renders comes from this file — no backend.
 * Registration plates follow real RTO codes: DL = Delhi, UP 16 = Noida (Gautam
 * Buddh Nagar), HR 26 = Gurgaon. Bicycles carry no RTO plate in India, so they
 * get a RentAny asset tag instead.
 */

export const CITIES: readonly string[] = ['Delhi', 'Noida', 'Gurgaon'];

export const TYPES: readonly TypeTab[] = [
  { id: 'car',     label: 'Cars',      one: 'Car',      icon: 'car' },
  { id: 'bike',    label: 'Bikes',     one: 'Bike',     icon: 'bike' },
  { id: 'scooter', label: 'Scooters',  one: 'Scooter',  icon: 'scooter' },
  { id: 'bicycle', label: 'Bicycles',  one: 'Bicycle',  icon: 'bicycle' },
];

export const OWNERS: Readonly<Record<string, Owner>> = {
  o1: { id: 'o1', name: 'Rohan Mehta',      initials: 'RM', rating: 4.8, trips: 127, since: '2023', responds: '~8 min',  verified: true },
  o2: { id: 'o2', name: 'Ananya Iyer',      initials: 'AI', rating: 4.9, trips: 212, since: '2022', responds: '~4 min',  verified: true },
  o3: { id: 'o3', name: 'Vikram Chauhan',   initials: 'VC', rating: 4.7, trips: 89,  since: '2024', responds: '~15 min', verified: true },
  o4: { id: 'o4', name: 'Simran Kaur',      initials: 'SK', rating: 4.6, trips: 64,  since: '2024', responds: '~22 min', verified: true },
  o5: { id: 'o5', name: 'Arjun Nair',       initials: 'AN', rating: 4.9, trips: 301, since: '2021', responds: '~3 min',  verified: true },
  o6: { id: 'o6', name: 'Kabir Malhotra',   initials: 'KM', rating: 4.5, trips: 47,  since: '2025', responds: '~30 min', verified: false },
  o7: { id: 'o7', name: 'Devansh Rana',     initials: 'DR', rating: 4.8, trips: 156, since: '2023', responds: '~10 min', verified: true },
  o8: { id: 'o8', name: 'Priya Sharma',     initials: 'PS', rating: 4.7, trips: 178, since: '2023', responds: '~6 min',  verified: true },
  o9: { id: 'o9', name: 'Nisha Verma',      initials: 'NV', rating: 4.9, trips: 134, since: '2024', responds: '~5 min',  verified: true },
  o10:{ id: 'o10',name: 'Sameer Qureshi',   initials: 'SQ', rating: 4.4, trips: 38,  since: '2025', responds: '~40 min', verified: false },
  o11:{ id: 'o11',name: 'Meera Joshi',      initials: 'MJ', rating: 4.6, trips: 72,  since: '2024', responds: '~18 min', verified: true },
  o12:{ id: 'o12',name: 'Harleen Gill',     initials: 'HG', rating: 4.7, trips: 118, since: '2023', responds: '~12 min', verified: true },
};

/** The signed-in owner for the owner dashboard. */
export const ME_OWNER = OWNERS['o1'] as Owner;
/** The signed-in renter for the renter dashboard. */
export const ME_RENTER: Renter = { name: 'Shivanshu Dixit', initials: 'SD', since: '2024', trips: 14, rating: 4.8 };

/**
 * Booked date ranges are stored as day-offsets from today so the calendar always
 * shows a believable mix of open and blocked days, whenever the demo is run.
 */
/**
 * Money literals below are whole RUPEES, because "daily: 1899" is what a human
 * can check against a rate card and "daily: 189900" is not. Conversion to
 * integer paise happens once, at the bottom of this file — the same boundary
 * the API will convert at. Nothing downstream ever sees a rupee.
 */
type SeedVehicle = Omit<Vehicle, 'hourly' | 'daily' | 'deposit'> & {
  readonly hourly: number;
  readonly daily: number;
  readonly deposit: number;
};

const VEHICLES_IN_RUPEES: readonly SeedVehicle[] = [
  {
    id: 'v12', type: 'car', name: 'Mahindra Scorpio-N Z8L', tagline: 'Full-size SUV · 2024',
    plate: { code: 'DL 1C', series: 'BN', num: '6612' },
    city: 'Delhi', area: 'Vasant Kunj', distance: 2.4,
    hourly: 319, daily: 3999, rating: 4.7, reviews: 83, trips: 118, ownerId: 'o12',
    color: '#8A6A3C', accent: '#5A4224', map: { x: 196, y: 262 },
    specs: { seats: 7, fuel: 'Diesel', transmission: 'Automatic', mileage: '15 kmpl', drive: '4x2', year: 2024 },
    features: ['Electric sunroof', 'Sony 3D audio (12 speakers)', 'Ventilated front seats', 'Six airbags', 'Cruise control', 'Wireless charging'],
    rules: 'Fuel policy: same-to-same. Outstation travel allowed; hill driving needs prior approval.',
    deposit: 7000, booked: [[5, 7], [15, 17], [25, 26]],
  },
  {
    id: 'v1', type: 'car', name: 'Maruti Suzuki Swift VXi', tagline: 'Hatchback · 2022',
    plate: { code: 'DL 3C', series: 'AJ', num: '4471' },
    city: 'Delhi', area: 'Lajpat Nagar', distance: 1.2,
    hourly: 149, daily: 1899, rating: 4.8, reviews: 96, trips: 127, ownerId: 'o1',
    color: '#C7D3DA', accent: '#8FA5B1', map: { x: 206, y: 300 },
    specs: { seats: 5, fuel: 'Petrol', transmission: 'Manual', mileage: '22 kmpl', boot: '268 L', year: 2022 },
    features: ['Air conditioning', 'Bluetooth audio', 'Rear parking sensors', 'Airbags (dual)', 'Power steering', 'USB charging'],
    rules: 'Fuel policy: same-to-same. Inter-state travel allowed with prior approval.',
    deposit: 2000, booked: [[2, 4], [11, 13], [19, 21]],
  },
  {
    id: 'v2', type: 'car', name: 'Hyundai Creta SX (O)', tagline: 'Compact SUV · 2023',
    plate: { code: 'HR 26', series: 'DK', num: '1102' },
    city: 'Gurgaon', area: 'Cyber Hub', distance: 3.4,
    hourly: 279, daily: 3499, rating: 4.9, reviews: 154, trips: 212, ownerId: 'o2',
    color: '#2E3B45', accent: '#141C22', map: { x: 104, y: 440 },
    specs: { seats: 5, fuel: 'Diesel', transmission: 'Automatic', mileage: '18 kmpl', boot: '433 L', year: 2023 },
    features: ['Panoramic sunroof', 'Ventilated seats', '360° camera', 'Cruise control', 'Wireless CarPlay', 'Six airbags'],
    rules: 'Fuel policy: same-to-same. Minimum booking 4 hours.',
    deposit: 5000, booked: [[1, 1], [6, 9], [16, 17], [24, 26]],
  },
  {
    id: 'v3', type: 'car', name: 'Tata Nexon EV Max', tagline: 'Electric SUV · 2024', ev: true,
    plate: { code: 'UP 16', series: 'BT', num: '8890' },
    city: 'Noida', area: 'Sector 62', distance: 2.8,
    hourly: 239, daily: 2999, rating: 4.7, reviews: 71, trips: 89, ownerId: 'o3',
    color: '#1E6F63', accent: '#0E463E', map: { x: 300, y: 320 },
    specs: { seats: 5, fuel: 'Electric', transmission: 'Automatic', range: '437 km', charge: '56 min (DC)', year: 2024 },
    features: ['Fast charging cable', 'Sunroof', 'Connected car app', 'Regen braking modes', 'Air purifier', 'Wireless charging'],
    rules: 'Return with at least 20% charge. Free charging card included.',
    deposit: 5000, booked: [[3, 3], [8, 12], [22, 23]],
  },
  {
    id: 'v4', type: 'car', name: 'Mahindra Thar LX 4x4', tagline: 'Off-roader · 2023',
    plate: { code: 'HR 26', series: 'CX', num: '7734' },
    city: 'Gurgaon', area: 'Sector 29', distance: 5.1,
    hourly: 349, daily: 4499, rating: 4.6, reviews: 58, trips: 64, ownerId: 'o4',
    color: '#B03A2E', accent: '#7A241B', map: { x: 128, y: 492 },
    specs: { seats: 4, fuel: 'Diesel', transmission: 'Manual', mileage: '15 kmpl', drive: '4x4', year: 2023 },
    features: ['Hard top', '4x4 low range', 'Cruise control', 'Roof rails', 'All-terrain tyres', 'Touchscreen infotainment'],
    rules: 'Hill driving permitted. Off-road use requires owner approval.',
    deposit: 8000, booked: [[0, 2], [14, 18], [27, 29]],
  },
  {
    id: 'v5', type: 'bike', name: 'Royal Enfield Classic 350', tagline: 'Cruiser · 2023',
    plate: { code: 'DL 8C', series: 'AR', num: '2265' },
    city: 'Delhi', area: 'Karol Bagh', distance: 0.8,
    hourly: 99, daily: 1199, rating: 4.9, reviews: 221, trips: 301, ownerId: 'o5',
    color: '#254A34', accent: '#12291D', map: { x: 170, y: 240 },
    specs: { engine: '349 cc', power: '20.2 bhp', mileage: '41 kmpl', kerb: '195 kg', transmission: '5-speed', year: 2023 },
    features: ['Two helmets included', 'USB phone mount', 'Saddle bags', 'Tripper navigation', 'Crash guard', 'Tubeless tyres'],
    rules: 'Valid two-wheeler licence required. Helmets are mandatory.',
    deposit: 3000, booked: [[1, 3], [7, 8], [15, 16], [25, 28]],
  },
  {
    id: 'v6', type: 'bike', name: 'Yamaha MT-15 V2', tagline: 'Streetfighter · 2024',
    plate: { code: 'UP 16', series: 'CS', num: '3318' },
    city: 'Noida', area: 'Sector 18', distance: 2.1,
    hourly: 89, daily: 999, rating: 4.5, reviews: 34, trips: 47, ownerId: 'o6',
    color: '#2B3A8F', accent: '#16214F', map: { x: 286, y: 366 },
    specs: { engine: '155 cc', power: '18.1 bhp', mileage: '48 kmpl', kerb: '141 kg', transmission: '6-speed', year: 2024 },
    features: ['Single-channel ABS', 'LED projector headlamp', 'Helmet included', 'Assist & slipper clutch', 'Digital console'],
    rules: 'Riders must be 18+ with a valid licence. City use only.',
    deposit: 2500, booked: [[4, 6], [13, 14], [20, 22]],
  },
  {
    id: 'v7', type: 'bike', name: 'KTM 390 Duke', tagline: 'Naked sport · 2024',
    plate: { code: 'HR 26', series: 'EK', num: '9047' },
    city: 'Gurgaon', area: 'Golf Course Road', distance: 4.6,
    hourly: 139, daily: 1699, rating: 4.8, reviews: 112, trips: 156, ownerId: 'o7',
    color: '#E8631A', accent: '#A33F09', map: { x: 78, y: 420 },
    specs: { engine: '398 cc', power: '45.3 bhp', mileage: '28 kmpl', kerb: '165 kg', transmission: '6-speed', year: 2024 },
    features: ['Cornering ABS', 'Quickshifter+', 'Ride modes', 'TFT dash', 'Track pack', 'Helmet included'],
    rules: 'Minimum 2 years riding experience. Speed limited to 100 km/h.',
    deposit: 5000, booked: [[2, 2], [9, 11], [18, 19]],
  },
  {
    id: 'v8', type: 'scooter', name: 'Honda Activa 6G', tagline: 'City scooter · 2023',
    plate: { code: 'DL 3C', series: 'BM', num: '5590' },
    city: 'Delhi', area: 'Saket', distance: 1.5,
    hourly: 49, daily: 599, rating: 4.7, reviews: 143, trips: 178, ownerId: 'o8',
    color: '#5C6B78', accent: '#333F49', map: { x: 182, y: 360 },
    specs: { engine: '109 cc', power: '7.7 bhp', mileage: '60 kmpl', kerb: '106 kg', storage: '18 L', year: 2023 },
    features: ['Two helmets included', 'Under-seat storage', 'Mobile charging socket', 'Silent start', 'Telescopic front fork'],
    rules: 'Fuel not included. Return with the same fuel level.',
    deposit: 1500, booked: [[0, 1], [10, 12], [23, 24]],
  },
  {
    id: 'v9', type: 'scooter', name: 'Ather 450X Gen 3', tagline: 'Electric scooter · 2024', ev: true,
    plate: { code: 'UP 16', series: 'DL', num: '4412' },
    city: 'Noida', area: 'Sector 137', distance: 3.9,
    hourly: 69, daily: 799, rating: 4.9, reviews: 88, trips: 134, ownerId: 'o9',
    color: '#1C8C7A', accent: '#0B564A', map: { x: 322, y: 430 },
    specs: { engine: 'PMSM motor', power: '8.6 bhp', range: '146 km', charge: '4h 30m', storage: '22 L', year: 2024 },
    features: ['Portable charger', 'Google Maps on dash', 'Reverse mode', 'Ather Grid access', 'Two helmets', 'Warp mode'],
    rules: 'Return with at least 15% charge. Charger must be returned.',
    deposit: 2500, booked: [[5, 7], [17, 18], [26, 27]],
  },
  {
    id: 'v10', type: 'bicycle', name: 'Firefox Bad Attitude 27.5', tagline: 'Hardtail MTB',
    plate: { code: 'RENTANY', series: 'BCY', num: '0142', tag: true },
    city: 'Delhi', area: 'Hauz Khas', distance: 0.6,
    hourly: 29, daily: 299, rating: 4.4, reviews: 27, trips: 38, ownerId: 'o10',
    color: '#D94F2B', accent: '#94301A', map: { x: 152, y: 336 },
    specs: { gears: 21, frame: 'Alloy 6061', brakes: 'Disc (mech.)', wheel: '27.5 in', weight: '14.2 kg', suspension: 'Front 100 mm' },
    features: ['Helmet included', 'Puncture kit', 'LED lights', 'Bottle cage', 'Phone mount', 'Cable lock'],
    rules: 'Ride within Delhi city limits. Lock the cycle when unattended.',
    deposit: 1000, booked: [[3, 5], [12, 13], [21, 22]],
  },
  {
    id: 'v11', type: 'bicycle', name: 'Btwin Riverside 120', tagline: 'Hybrid commuter',
    plate: { code: 'RENTANY', series: 'BCY', num: '0288', tag: true },
    city: 'Gurgaon', area: 'Sushant Lok', distance: 3.2,
    hourly: 25, daily: 249, rating: 4.6, reviews: 41, trips: 72, ownerId: 'o11',
    color: '#2F7FB5', accent: '#1A4E70', map: { x: 112, y: 400 },
    specs: { gears: 6, frame: 'Steel', brakes: 'V-brake', wheel: '28 in', weight: '15.6 kg', carrier: 'Rear rack' },
    features: ['Helmet included', 'Rear carrier', 'Mudguards', 'Kickstand', 'Bell', 'Cable lock'],
    rules: 'Ride within Gurgaon city limits. Lock the cycle when unattended.',
    deposit: 800, booked: [[1, 2], [8, 10], [20, 21]],
  },
];

export const VEHICLES: readonly Vehicle[] = VEHICLES_IN_RUPEES.map((v) => ({
  ...v,
  hourly: toPaise(v.hourly),
  daily: toPaise(v.daily),
  deposit: toPaise(v.deposit),
}));

export const byId = (id: string | undefined): Vehicle | undefined =>
  VEHICLES.find((v) => v.id === id);
export const ownerOf = (v: Vehicle): Owner => OWNERS[v.ownerId] as Owner;

/** For ids that come from this file rather than from a URL. A miss is a typo in
 *  the seed, not a 404, so it throws instead of widening every caller's type. */
export function requireById(id: string): Vehicle {
  const v = byId(id);
  if (!v) throw new Error(`seed: no vehicle with id "${id}"`);
  return v;
}

/** Owner-dashboard vehicle statuses, keyed by vehicle id. */
export const OWNER_VEHICLE_IDS: readonly string[] = ['v1', 'v5', 'v8', 'v10'];
export const INITIAL_STATUS: Readonly<Record<string, VehicleStatus>> = { v1: 'rented', v5: 'available', v8: 'available', v10: 'maintenance' };

/** Monthly earnings for the owner's bar chart, in INR. */
const EARNINGS_IN_RUPEES: readonly { m: string; v: number }[] = [
  { m: 'Sep', v: 18400 }, { m: 'Oct', v: 24900 }, { m: 'Nov', v: 21300 },
  { m: 'Dec', v: 33800 }, { m: 'Jan', v: 27600 }, { m: 'Feb', v: 25100 },
  { m: 'Mar', v: 31200 }, { m: 'Apr', v: 29700 }, { m: 'May', v: 38400 },
  { m: 'Jun', v: 34500 }, { m: 'Jul', v: 41200 }, { m: 'Aug', v: 46800 },
];

/** Bookings received by the owner. `days` is an offset from today. */
const OWNER_BOOKINGS_IN_RUPEES: readonly (Omit<OwnerBooking, 'amount'> & { amount: number })[] = [
  { id: 'RA-8F42K9', vehicleId: 'v1',  renter: 'Aditya Bansal',  initials: 'AB', days: 0,  nights: 3, amount: 6297,  status: 'ongoing' },
  { id: 'RA-3M17Q2', vehicleId: 'v5',  renter: 'Tanvi Sethi',    initials: 'TS', days: 2,  nights: 2, amount: 2518,  status: 'upcoming' },
  { id: 'RA-9K55D1', vehicleId: 'v8',  renter: 'Harsh Vardhan',  initials: 'HV', days: 5,  nights: 1, amount: 707,   status: 'upcoming' },
  { id: 'RA-2P88X7', vehicleId: 'v1',  renter: 'Ritika Goel',    initials: 'RG', days: -4, nights: 4, amount: 8964,  status: 'completed' },
  { id: 'RA-6T31L4', vehicleId: 'v10', renter: 'Nikhil Bhatia',  initials: 'NB', days: -9, nights: 2, amount: 706,   status: 'completed' },
  { id: 'RA-1C09W8', vehicleId: 'v5',  renter: 'Ishaan Kapoor',  initials: 'IK', days: -14,nights: 5, amount: 7075,  status: 'completed' },
];

/** Bookings made by the signed-in renter. */
const RENTER_BOOKINGS_IN_RUPEES: readonly (Omit<RenterBooking, 'amount'> & { amount: number })[] = [
  { id: 'RA-7Y21B5', vehicleId: 'v2',  start: 3,   nights: 3, amount: 12386, status: 'upcoming', rated: 0 },
  { id: 'RA-4Q66N3', vehicleId: 'v9',  start: 9,   nights: 2, amount: 1886,  status: 'upcoming', rated: 0 },
  { id: 'RA-5J13V0', vehicleId: 'v7',  start: 0,   nights: 1, amount: 2005,  status: 'ongoing',  rated: 0 },
  { id: 'RA-8B47R6', vehicleId: 'v3',  start: -7,  nights: 4, amount: 14156, status: 'past',     rated: 5 },
  { id: 'RA-2D90S9', vehicleId: 'v6',  start: -16, nights: 2, amount: 2358,  status: 'past',     rated: 4 },
  { id: 'RA-6H72F1', vehicleId: 'v11', start: -23, nights: 3, amount: 882,   status: 'past',     rated: 0 },
  { id: 'RA-3N58G4', vehicleId: 'v5',  start: -34, nights: 5, amount: 7075,  status: 'past',     rated: 5 },
];

export const EARNINGS: readonly EarningsBar[] = EARNINGS_IN_RUPEES.map((e) => ({
  ...e,
  v: toPaise(e.v),
}));

export const OWNER_BOOKINGS: readonly OwnerBooking[] = OWNER_BOOKINGS_IN_RUPEES.map((b) => ({
  ...b,
  amount: toPaise(b.amount),
}));

export const RENTER_BOOKINGS: readonly RenterBooking[] = RENTER_BOOKINGS_IN_RUPEES.map((b) => ({
  ...b,
  amount: toPaise(b.amount),
}));

export const REVIEWS: readonly Review[] = [
  { by: 'Aditya Bansal',  initials: 'AB', stars: 5, when: '2 weeks ago', text: 'Spotless vehicle and Rohan handed it over right on time at the metro gate. Pickup took under five minutes.' },
  { by: 'Ritika Goel',    initials: 'RG', stars: 5, when: '1 month ago', text: 'Second time renting this one. Documents were ready, fuel level was exactly as promised, zero haggling at return.' },
  { by: 'Nikhil Bhatia',  initials: 'NB', stars: 4, when: '2 months ago',text: 'Drove Delhi to Jaipur and back with no trouble. Only note is that the AC takes a minute to cool down.' },
];
