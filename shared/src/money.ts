/**
 * Money. Integer paise only — 1999 means ₹19.99.
 *
 * Rule 0.2.1 of the build guide: no Float, no Decimal arithmetic in JS.
 * Every value that leaves this module satisfies Number.isInteger().
 *
 * The brand exists so `const total: Paise = 19.99` is a compile error. It is
 * erased at runtime; the runtime guarantee comes from `paise()` and the fact
 * that every operation below rounds before it returns.
 */

declare const PAISE: unique symbol;

export type Paise = number & { readonly [PAISE]: true };

/** Largest amount we will handle: ₹10,00,00,000. Beyond this, Number loses
 *  integer precision long before it matters, but a cap catches runaway math. */
export const MAX_PAISE = 100_000_000_00;

export class MoneyError extends Error {
  override readonly name = 'MoneyError';
}

/** Assert-and-brand. The ONLY way to mint a Paise from a raw number. */
export function paise(n: number): Paise {
  if (!Number.isFinite(n)) throw new MoneyError(`paise: not finite: ${n}`);
  if (!Number.isInteger(n)) throw new MoneyError(`paise: not an integer: ${n}`);
  if (Math.abs(n) > MAX_PAISE) throw new MoneyError(`paise: out of range: ${n}`);
  return n as Paise;
}

export const ZERO: Paise = paise(0);

/** ₹19.99 -> 1999p. Rupees may be fractional; paise never are. */
export function toPaise(rupees: number): Paise {
  if (!Number.isFinite(rupees)) throw new MoneyError(`toPaise: not finite: ${rupees}`);
  return paise(roundHalfUp(rupees * 100));
}

/** 1999p -> 19.99. For display and JSON only — never feed this back into math. */
export function toRupees(p: Paise): number {
  return p / 100;
}

export function addPaise(a: Paise, b: Paise): Paise {
  return paise(a + b);
}

export function subPaise(a: Paise, b: Paise): Paise {
  return paise(a - b);
}

export function sumPaise(amounts: readonly Paise[]): Paise {
  return paise(amounts.reduce<number>((acc, n) => acc + n, 0));
}

/**
 * Multiply by a real-valued factor, rounding half-up to the nearest paise
 * IMMEDIATELY (Appendix A.9). Never carry a float through two multiplications:
 * chain mulPaise calls instead.
 */
export function mulPaise(p: Paise, multiplier: number): Paise {
  if (!Number.isFinite(multiplier)) {
    throw new MoneyError(`mulPaise: multiplier not finite: ${multiplier}`);
  }
  return paise(roundHalfUp(p * multiplier));
}

/** Split `p` into `parts` whole-paise shares that sum EXACTLY back to `p`.
 *  Remainder paise go to the earliest shares — no paise is created or lost. */
export function splitPaise(p: Paise, parts: number): Paise[] {
  if (!Number.isInteger(parts) || parts < 1) {
    throw new MoneyError(`splitPaise: parts must be a positive integer: ${parts}`);
  }
  const base = Math.trunc(p / parts);
  const remainder = p - base * parts;
  const sign = remainder < 0 ? -1 : 1;
  return Array.from({ length: parts }, (_, i) =>
    paise(base + (i < Math.abs(remainder) ? sign : 0)),
  );
}

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 147166 -> "₹1,471.66" */
export function formatINR(p: Paise): string {
  return INR.format(toRupees(p));
}

/**
 * Half-up means 0.5 rounds AWAY FROM ZERO, symmetrically: 2.5 -> 3, -2.5 -> -3.
 * Math.round breaks that symmetry (-2.5 -> -2), which makes a refund and its
 * matching charge disagree by a paise. Handle the sign explicitly.
 */
function roundHalfUp(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}
