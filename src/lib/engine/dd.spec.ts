import { describe, it, expect } from 'vitest';
import {
	fromNumber,
	toNumber,
	add,
	sub,
	neg,
	mul,
	sqr,
	addNumber,
	mulNumber,
	absDD,
	type DD
} from './dd';

/** The whole point: hold ~31 significant digits, well past f64's ~16. */
describe('double-double precision', () => {
	it('round-trips a plain number with a zero tail', () => {
		const a = fromNumber(-0.5);
		expect(a.hi).toBe(-0.5);
		expect(a.lo).toBe(0);
		expect(toNumber(a)).toBe(-0.5);
	});

	it('keeps a tail that f64 cannot represent next to 1', () => {
		// 1 + 1e-30 collapses to 1 in f64, but the DD carries the tail.
		const a = add(fromNumber(1), fromNumber(1e-30));
		expect(toNumber(a)).toBe(1); // rounding back to one f64 still loses it
		expect(toNumber(sub(a, fromNumber(1)))).toBeCloseTo(1e-30, 40); // …but the tail survives
	});

	it('reveals a difference f64 throws away (2^-60 below 1)', () => {
		const tiny = 2 ** -60; // far below ulp(1) = 2^-52
		const a = add(fromNumber(1), fromNumber(tiny));
		expect(1 + tiny - 1).toBe(0); // f64 loses it entirely
		expect(toNumber(sub(a, fromNumber(1)))).toBe(tiny); // DD keeps it exactly
	});
});

describe('double-double arithmetic', () => {
	it('adds and subtracts exact integers', () => {
		expect(toNumber(add(fromNumber(3), fromNumber(7)))).toBe(10);
		expect(toNumber(sub(fromNumber(3), fromNumber(7)))).toBe(-4);
	});

	it('negates', () => {
		const a: DD = neg(fromNumber(2.5));
		expect(a.hi).toBe(-2.5);
		expect(toNumber(a)).toBe(-2.5);
	});

	it('multiplies exact integers', () => {
		expect(toNumber(mul(fromNumber(6), fromNumber(7)))).toBe(42);
	});

	it('captures the cross term f64 would round away in a square', () => {
		// (1 + e)² = 1 + 2e + e² ; with e = 1e-18, f64 squaring loses the 2e term.
		const e = 1e-18;
		const a = add(fromNumber(1), fromNumber(e));
		const sq = sqr(a);
		expect(toNumber(sub(sq, fromNumber(1)))).toBeCloseTo(2 * e, 28);
		// sqr agrees with mul(a, a).
		expect(toNumber(sub(sq, mul(a, a)))).toBe(0);
	});

	it('addNumber matches add with a promoted number', () => {
		const a = add(fromNumber(1), fromNumber(1e-25));
		expect(toNumber(sub(addNumber(a, 2), add(a, fromNumber(2))))).toBe(0);
	});

	it('mulNumber by a power of two is exact', () => {
		const a = add(fromNumber(0.3), fromNumber(1e-20));
		const doubled = mulNumber(a, 2);
		expect(toNumber(sub(doubled, add(a, a)))).toBe(0);
	});

	it('absDD flips a negative value (tail included) and leaves a positive one', () => {
		const negVal = add(fromNumber(-2), fromNumber(-1e-25));
		const pos = absDD(negVal);
		expect(pos.hi).toBe(2);
		expect(toNumber(sub(pos, fromNumber(2)))).toBeCloseTo(1e-25, 35);
		const already = add(fromNumber(2), fromNumber(1e-25));
		expect(absDD(already)).toEqual(already);
	});
});
