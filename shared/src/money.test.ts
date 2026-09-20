import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  MAX_PAISE,
  MoneyError,
  ZERO,
  addPaise,
  formatINR,
  mulPaise,
  paise,
  splitPaise,
  subPaise,
  sumPaise,
  toPaise,
  toRupees,
} from './money';

describe('paise()', () => {
  it('rejects anything that is not a finite integer in range', () => {
    expect(() => paise(19.99)).toThrow(MoneyError);
    expect(() => paise(NaN)).toThrow(MoneyError);
    expect(() => paise(Infinity)).toThrow(MoneyError);
    expect(() => paise(MAX_PAISE + 1)).toThrow(MoneyError);
    expect(paise(0)).toBe(0);
    expect(paise(-1)).toBe(-1);
  });
});

describe('toPaise / toRupees', () => {
  it('converts without float drift', () => {
    expect(toPaise(19.99)).toBe(1999);
    expect(toPaise(0.1 + 0.2)).toBe(30); // 0.30000000000000004 -> 30, not 30.000000000000004
    expect(toPaise(1471.66)).toBe(147166);
    expect(toPaise(0)).toBe(0);
    expect(toPaise(-19.99)).toBe(-1999);
  });

  it('round-trips through rupees', () => {
    expect(toRupees(paise(147166))).toBeCloseTo(1471.66, 10);
  });

  it('rounds half away from zero, symmetrically', () => {
    expect(toPaise(0.005)).toBe(1);
    expect(toPaise(-0.005)).toBe(-1);
  });
});

describe('addPaise / subPaise / sumPaise', () => {
  it('adds and subtracts', () => {
    expect(addPaise(paise(147166), paise(100000))).toBe(247166);
    expect(subPaise(paise(100000), paise(147166))).toBe(-47166);
    expect(sumPaise([])).toBe(0);
    expect(sumPaise([paise(1), paise(2), paise(3)])).toBe(6);
  });

  it('refuses to overflow the range', () => {
    expect(() => addPaise(paise(MAX_PAISE), paise(1))).toThrow(MoneyError);
  });
});

describe('mulPaise', () => {
  it('matches the guide worked example, paise for paise', () => {
    let x = mulPaise(paise(100000), 1.322);
    expect(x).toBe(132200);
    x = mulPaise(x, 1.1);
    expect(x).toBe(145420);
    x = mulPaise(x, 0.88);
    expect(x).toBe(127970);
    x = mulPaise(x, 1.15);
    expect(x).toBe(147166);
    x = mulPaise(x, 1.0);
    expect(x).toBe(147166);
  });

  it('handles zero, identity and negative multipliers', () => {
    expect(mulPaise(paise(50000), 0)).toBe(0);
    expect(mulPaise(ZERO, 1.8)).toBe(0);
    expect(mulPaise(paise(50000), 1)).toBe(50000);
    expect(mulPaise(paise(50000), -0.25)).toBe(-12500);
    expect(mulPaise(paise(-50000), 0.25)).toBe(-12500);
  });

  it('rounds .5 away from zero in both directions', () => {
    expect(mulPaise(paise(5), 0.5)).toBe(3); //  2.5 ->  3
    expect(mulPaise(paise(-5), 0.5)).toBe(-3); // -2.5 -> -3
  });

  it('survives large values', () => {
    expect(mulPaise(paise(1_000_000_00), 1.8)).toBe(180_000_000);
  });

  it('never lets a float escape, however long the chain', () => {
    let x = paise(99999);
    for (const m of [1.322, 1.1, 0.88, 1.15, 0.95, 1.07, 0.7, 2.0, 1.0001]) {
      x = mulPaise(x, m);
      expect(Number.isInteger(x)).toBe(true);
    }
  });

  it('rejects a non-finite multiplier instead of producing NaN money', () => {
    expect(() => mulPaise(paise(100), NaN)).toThrow(MoneyError);
    expect(() => mulPaise(paise(100), Infinity)).toThrow(MoneyError);
  });
});

describe('splitPaise', () => {
  it('splits without creating or losing a paise', () => {
    expect(splitPaise(paise(100), 3)).toEqual([34, 33, 33]);
    expect(splitPaise(paise(-100), 3)).toEqual([-34, -33, -33]);
    expect(splitPaise(paise(10), 1)).toEqual([10]);
    expect(() => splitPaise(paise(10), 0)).toThrow(MoneyError);
  });

  it('always sums back to the original', () => {
    fc.assert(
      fc.property(fc.integer({ min: -1e9, max: 1e9 }), fc.integer({ min: 1, max: 97 }), (p, n) => {
        const parts = splitPaise(paise(p), n);
        expect(parts).toHaveLength(n);
        expect(sumPaise(parts)).toBe(p);
      }),
    );
  });
});

describe('formatINR', () => {
  it('renders Indian digit grouping', () => {
    expect(formatINR(paise(147166))).toBe('₹1,471.66');
    expect(formatINR(ZERO)).toBe('₹0.00');
    expect(formatINR(paise(10000000))).toBe('₹1,00,000.00');
    expect(formatINR(paise(-1999))).toBe('-₹19.99');
  });
});

describe('property: every operation returns an integer', () => {
  it('holds for arbitrary valid inputs', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -1e8, max: 1e8 }),
        fc.float({ min: Math.fround(-5), max: Math.fround(5), noNaN: true }),
        (p, m) => {
          expect(Number.isInteger(mulPaise(paise(p), m))).toBe(true);
        },
      ),
    );
  });
});
