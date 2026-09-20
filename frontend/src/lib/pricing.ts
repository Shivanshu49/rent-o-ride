/**
 * Pricing model.
 *
 * base            nightly rate x nights
 * demand          weekend and near-term pickups cost more (surge, shown to the renter)
 * advance saver   booking a week or more ahead earns a discount
 * platform fee    5%, floor of Rs 29
 * GST             18% on the fare plus fee
 * deposit         refundable, quoted separately from the fare
 */

import type { AdvanceDiscount, Demand, Quote, Vehicle } from '../types';
import { addDays, diffDays } from './dates';

export const inr = (n: number): string =>
  '₹' + Math.round(n).toLocaleString('en-IN');

/** Compact form for map pins and dense tables: Rs 1.9k */
export const inrShort = (n: number): string =>
  n >= 1000 ? '₹' + (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace(/\.0$/, '') + 'k' : '₹' + n;

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
    const d = demandFor(addDays(start, i));
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

/**
 * Full price breakdown for a booking.
 *
 * Prototype-grade on purpose: rupees, floats, and a demand curve driven by the
 * day of the week. Phase 5 replaces all of it with the real engine in
 * packages/domain — integer paise, D/S surge, occupancy, lead time and a
 * guardrail clamp — and this file goes away. Do not extend it.
 */
export function quote(vehicle: Vehicle, start: Date, nights: number): Quote {
  const n = Math.max(1, nights || 1);
  const base = vehicle.daily * n;
  const demand = demandForRange(start, n);
  const surge = Math.round(base * (demand.mult - 1));
  const fare = base + surge;

  const daysAhead = Math.max(0, diffDays(new Date(), start));
  const adv = advanceDiscount(daysAhead);
  const discount = Math.round(fare * adv.rate);

  const net = fare - discount;
  const fee = Math.max(29, Math.round(net * 0.05));
  const gst = Math.round((net + fee) * 0.18);
  const total = net + fee + gst;

  return {
    nights: n, base, demand, surge, fare,
    daysAhead, advance: adv, discount,
    net, fee, gst, total,
    deposit: vehicle.deposit,
    payable: total,
  };
}

/** Booking id in the format the confirmation screen and QR both carry. */
export function makeBookingId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)] ?? 'X';
  return `RA-${s}`;
}
