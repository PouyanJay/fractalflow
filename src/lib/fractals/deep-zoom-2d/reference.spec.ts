import { describe, it, expect } from 'vitest';
import {
	mandelbrotEscape,
	pixelToComplex,
	lyapunovExponent,
	apollonianValue,
	novaEscape,
	FORMULA_CODES,
	FORMULA_HOME
} from './reference';

describe('mandelbrotEscape', () => {
	it('keeps the origin inside the set', () => {
		const r = mandelbrotEscape(0, 0, 200);
		expect(r.escaped).toBe(false);
		expect(r.smooth).toBe(200);
	});

	it('keeps the period-2 bulb point (-1, 0) inside', () => {
		expect(mandelbrotEscape(-1, 0, 500).escaped).toBe(false);
	});

	it('escapes a far point quickly', () => {
		const r = mandelbrotEscape(2, 2, 200);
		expect(r.escaped).toBe(true);
		expect(r.iter).toBeLessThan(5);
	});

	it('gives escaped points a finite smooth value near the integer iteration', () => {
		const r = mandelbrotEscape(0.5, 0.5, 200);
		expect(r.escaped).toBe(true);
		expect(Number.isFinite(r.smooth)).toBe(true);
		// Smooth coloring is a small fractional adjustment around the escape iteration.
		expect(Math.abs(r.smooth - r.iter)).toBeLessThan(5);
	});
});

describe('lyapunovExponent', () => {
	it('is negative in stable (periodic) regimes', () => {
		// r = 2.5 has a stable fixed point; r = 3.2 is period-2 — both λ < 0. The
		// critical-point seed (x₀ = 0.5) makes these regimes strongly negative.
		expect(lyapunovExponent(2.5, 2.5, 2000)).toBeLessThan(0);
		expect(lyapunovExponent(3.2, 3.2, 2000)).toBeLessThan(0);
	});

	it('is positive in chaotic regimes', () => {
		expect(lyapunovExponent(3.9, 3.9, 4000)).toBeGreaterThan(0);
		expect(lyapunovExponent(3.7, 3.7, 4000)).toBeGreaterThan(0);
	});

	it('responds to the A/B sequence — a stable a with chaotic b lands between', () => {
		// Alternating a deep-stable rate with a chaotic one yields an intermediate λ.
		const lam = lyapunovExponent(2.5, 3.9, 4000);
		expect(Number.isFinite(lam)).toBe(true);
		expect(lam).toBeLessThan(lyapunovExponent(3.9, 3.9, 4000));
	});

	it('is finite even when the orbit passes through the critical point', () => {
		expect(Number.isFinite(lyapunovExponent(4, 4, 500))).toBe(true);
	});

	it('is registered as formula code 12 with a home camera in (a,b) space', () => {
		expect(FORMULA_CODES.lyapunov).toBe(12);
		expect(FORMULA_HOME.lyapunov?.centerX).toBeGreaterThan(2);
		expect(FORMULA_HOME.lyapunov?.centerX).toBeLessThan(4);
	});
});

describe('apollonianValue', () => {
	it('is finite and positive everywhere in the cell', () => {
		for (const [x, y] of [
			[0, 0],
			[0.3, -0.2],
			[-0.7, 0.5],
			[0.9, 0.9]
		]) {
			const v = apollonianValue(x, y, 12);
			expect(Number.isFinite(v)).toBe(true);
			expect(v).toBeGreaterThanOrEqual(0);
		}
	});

	it('is deterministic for a given point and iteration count', () => {
		expect(apollonianValue(0.31, 0.17, 16)).toBe(apollonianValue(0.31, 0.17, 16));
	});

	it('is symmetric under the gasket lattice fold (period 2 in each axis)', () => {
		// The fold maps p → p mod 2 into [-1,1], so shifting by 2 is invariant.
		expect(apollonianValue(0.3, 0.4, 14)).toBeCloseTo(apollonianValue(0.3 + 2, 0.4, 14), 6);
	});

	it('is registered as formula code 13', () => {
		expect(FORMULA_CODES.apollonian).toBe(13);
	});
});

describe('novaEscape', () => {
	it('converges immediately at c = 0 (z₀ = 1 is already a root of z³ − 1)', () => {
		const r = novaEscape(0, 0, 100);
		expect(r.converged).toBe(true);
		expect(r.escaped).toBe(false);
		expect(r.iter).toBe(0);
	});

	it('classifies every pixel as exactly one of converged / escaped / interior', () => {
		for (const [x, y] of [
			[0, 0],
			[0.3, -0.2],
			[-0.7, 0.5],
			[1.5, 1.5],
			[0.1, 0.9]
		]) {
			const r = novaEscape(x, y, 200);
			expect(Number.isFinite(r.iter)).toBe(true);
			expect(r.iter).toBeGreaterThanOrEqual(0);
			expect(r.converged && r.escaped).toBe(false); // never both
		}
	});

	it('is deterministic for a given point and iteration count', () => {
		expect(novaEscape(0.42, -0.13, 64)).toEqual(novaEscape(0.42, -0.13, 64));
	});

	it('is registered as formula code 14', () => {
		expect(FORMULA_CODES.nova).toBe(14);
	});
});

describe('pixelToComplex', () => {
	it('maps the center pixel to the camera center', () => {
		const c = pixelToComplex(400, 300, 800, 600, -0.5, 0, 3);
		expect(c.x).toBeCloseTo(-0.5);
		expect(c.y).toBeCloseTo(0);
	});

	it('treats up as the positive imaginary direction', () => {
		const above = pixelToComplex(400, 200, 800, 600, 0, 0, 3);
		expect(above.y).toBeGreaterThan(0);
	});

	it('scales horizontal distance by the per-pixel size', () => {
		const c = pixelToComplex(400 + 100, 300, 800, 600, 0, 0, 600); // perPixel = 600/600 = 1
		expect(c.x).toBeCloseTo(100);
	});
});
