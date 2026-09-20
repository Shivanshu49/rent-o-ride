import type { Vehicle } from '../types';

/** Date helpers. Everything is anchored to "today" so the demo never goes stale. */

export const DAY_MS = 86400000;

export function today(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Whole days between two midnights. */
export function diffDays(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS);
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export const sameDay = (a: Date | null, b: Date | null): boolean =>
  Boolean( a && b && startOfDay(a).getTime() === startOfDay(b).getTime());

/** Offset in days from today — the unit the seed data is written in. */
export const offsetOf = (date: Date): number => diffDays(today(), date);

const MONTHS: readonly string[] = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT: readonly string[] = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DOW: readonly string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export const monthName = (date: Date): string => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;

/** "Tue, 19 Aug" */
export function fmtShort(date: Date): string {
  const d = new Date(date);
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] ?? '';
  return `${dow}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** "19 Aug 2026" */
export function fmtLong(date: Date): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

/** "19 Aug" */
export function fmtTiny(date: Date): string {
  const d = new Date(date);
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

/** ISO yyyy-mm-dd, in local time (not UTC) so it never slips a day. */
export function isoKey(date: Date): string {
  const d = new Date(date);
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Six-week grid of Date objects for the month containing `date`, padded with
 * leading and trailing days so every row is full.
 */
export function monthMatrix(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const start = addDays(first, -first.getDay());
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

/** Expand a vehicle's [startOffset, endOffset] ranges into a Set of ISO keys. */
export function bookedKeys(vehicle: Pick<Vehicle, 'booked'>): Set<string> {
  const set = new Set<string>();
  const base = today();
  for (const [from, to] of vehicle.booked) {
    for (let i = from; i <= to; i++) set.add(isoKey(addDays(base, i)));
  }
  return set;
}

/** True when any day in [start, end] is already taken — the no-double-booking rule. */
export function rangeHasConflict(start: Date | null, end: Date | null, blocked: ReadonlySet<string>): boolean {
  if (!start || !end) return false;
  const n = diffDays(start, end);
  for (let i = 0; i <= n; i++) {
    if (blocked.has(isoKey(addDays(start, i)))) return true;
  }
  return false;
}

/** Human countdown, e.g. "in 3 days" / "starts today". */
export function relativeDay(date: Date): string {
  const n = offsetOf(date);
  if (n === 0) return 'today';
  if (n === 1) return 'tomorrow';
  if (n === -1) return 'yesterday';
  return n > 0 ? `in ${n} days` : `${Math.abs(n)} days ago`;
}
