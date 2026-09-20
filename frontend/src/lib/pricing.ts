import { addPaise, mulPaise, paise, subPaise, toPaise, toRupees, type Paise } from '@ror/shared';
import type { AdvanceDiscount, Demand, Quote, Vehicle } from '../types';
import { diffDays } from './dates';

/**
 * Prototype pricing.
 *
 * Deliberately simple: a weekday demand curve, an advance discount, a platform
 * fee and GST. Phase 5 replaces all of it with the real engine in shared/ —
 * slab selection, D/S surge with EMA smoothing, occupancy, lead time, seasonal
 * share and the guardrail clamp — and this file goes away. Do not extend it.
 *
 * What is NOT prototype-grade, and must survive into Phase 5: every amount is
 * integer paise, every multiplication goes through mulPaise so it rounds to a
 * whole paise immediately, and no float is ever carried across two operations.
 */

/** Platform commission withheld from the owner's payout. Phase 10 reads the
 *  real per-owner value from owner_profiles.commission_bps. */
export const OWNER_COMMISSION_BPS = 1500;

const PLATFORM_FEE_RATE = 0.05;
const PLATFORM_FEE_FLOOR = toPaise(29);
const GST_RATE = 0.18;

const INR_WHOLE = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const INR_EXACT = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * The only place an amount becomes a string. Whole rupees render without a
 * decimal tail, because "₹1,899.00" on every card is noise; a genuine part-rupee
 * amount shows its paise rather than being quietly rounded away.
 */
export const inr = (p: Paise): string =>
  p % 100 === 0 ? INR_WHOLE.format(toRupees(p)) : INR_EXACT.format(toRupees(p));

/** Compact form for map pins and dense tables: "₹1.9k". */
export function inrShort(p: Paise): string {
  const rupees = Math.round(toRupees(p));
  if (rupees < 1000) return `₹${rupees}`;
  const thousands = (rupees / 1000).toFixed(rupees >= 10_000 ? 0 : 1).replace(/\.0$/, '');
  return `₹${thousands}k`;
}

/** Fri/Sat/Sun run hot; Thursday is a shoulder day. */
export function demandFor(date: Date): Demand {
  const dow = new Date(date).getDay();
  if (dow === 5 || dow === 6) return { mult: 1.3, label: 'High demand' };
  if (dow === 0) return { mult: 1.2, label: 'Busy weekend' };
  if (dow === 4) return { mult: 1.1, label: 'Picking up' };
  return { mult: 1.0, label: 'Standard rate' };
}

/** The dearest day in the range sets the multiplier for the whole booking. */
export function demandForRange(start: Date, nights: number): Demand {
  let best: Demand = { mult: 1.0, label: 'Standard rate' };
  for (let i = 0; i < Math.max(1, nights); i++) {
    const d = demandFor(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
    if (d.mult > best.mult) best = d;
  }
  return best;
}

export function advanceDiscount(daysAhead: number): AdvanceDiscount {
  if (daysAhead >= 14) return { rate: 0.15, label: 'Advance saver · 14+ days' };
  if (daysAhead >= 7) return { rate: 0.1, label: 'Advance saver · 7+ days' };
  if (daysAhead >= 3) return { rate: 0.05, label: 'Advance saver · 3+ days' };
  return { rate: 0, label: null };
}

/** Full price breakdown for a booking. Every line is integer paise. */
export function quote(vehicle: Vehicle, start: Date, nights: number): Quote {
  const n = Math.max(1, nights || 1);
  const base = mulPaise(vehicle.daily, n);
  const demand = demandForRange(start, n);
  const surge = mulPaise(base, demand.mult - 1);
  const fare = addPaise(base, surge);

  const daysAhead = Math.max(0, diffDays(new Date(), start));
  const advance = advanceDiscount(daysAhead);
  const discount = mulPaise(fare, advance.rate);

  const net = subPaise(fare, discount);
  const fee = paise(Math.max(PLATFORM_FEE_FLOOR, mulPaise(net, PLATFORM_FEE_RATE)));

  // GST applies to the service, never to the refundable deposit. Folding the
  // deposit into the taxable base is a real compliance bug, not a rounding one.
  const gst = mulPaise(addPaise(net, fee), GST_RATE);
  const total = addPaise(addPaise(net, fee), gst);

  return {
    nights: n, base, demand, surge, fare,
    daysAhead, advance, discount,
    net, fee, gst, total,
    deposit: vehicle.deposit,
    payable: total,
  };
}

/** What the owner actually receives, after the platform's commission. */
export function ownerPayout(gross: Paise, commissionBps = OWNER_COMMISSION_BPS): Paise {
  return subPaise(gross, mulPaise(gross, commissionBps / 10_000));
}

/** Booking id in the format the confirmation screen and QR both carry. */
export function makeBookingId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)] ?? 'X';
  return `RA-${s}`;
}
