import { describe, it, expect } from 'vitest';
import {
	COLORINGS,
	COLORING_CODES,
	orbitTrapDistance,
	hsv2rgb,
	domainColor,
	distanceEstimate,
	mandelbrotColorData
} from './coloring';

describe('coloring metadata', () => {
	it('lists the five modes with stable shader codes', () => {
		expect(COLORINGS.map((c) => c.id)).toEqual([
			'smooth',
			'orbit-trap',
			'distance',
			'domain',
			'interior'
		]);
		expect(COLORING_CODES.smooth).toBe(0);
		expect(COLORING_CODES['orbit-trap']).toBe(1);
		expect(COLORING_CODES.distance).toBe(2);
		expect(COLORING_CODES.domain).toBe(3);
		expect(COLORING_CODES.interior).toBe(4);
	});
});

describe('orbitTrapDistance (Pickover cross)', () => {
	it('is the distance to the nearer axis', () => {
		expect(orbitTrapDistance(3, 1)).toBe(1);
		expect(orbitTrapDistance(0.5, 2)).toBe(0.5);
		expect(orbitTrapDistance(0, 5)).toBe(0);
	});
});

describe('hsv2rgb', () => {
	it('maps the primary hues', () => {
		expect(hsv2rgb(0, 1, 1)).toEqual([1, 0, 0]);
		expect(hsv2rgb(1 / 3, 1, 1).map((v) => Math.round(v))).toEqual([0, 1, 0]);
		expect(hsv2rgb(2 / 3, 1, 1).map((v) => Math.round(v))).toEqual([0, 0, 1]);
	});
	it('zero saturation is grey', () => {
		expect(hsv2rgb(0.42, 0, 0.5)).toEqual([0.5, 0.5, 0.5]);
	});
	it('wraps hue past 1', () => {
		expect(hsv2rgb(1, 1, 1)).toEqual(hsv2rgb(0, 1, 1));
	});
});

describe('domainColor', () => {
	it('returns rgb in [0,1]', () => {
		for (const [x, y] of [
			[1, 0],
			[-1, 0],
			[0, 1],
			[0.3, -0.7],
			[5, 5]
		]) {
			for (const ch of domainColor(x, y)) {
				expect(ch).toBeGreaterThanOrEqual(0);
				expect(ch).toBeLessThanOrEqual(1);
			}
		}
	});
	it('hue tracks phase: +real and -real differ', () => {
		expect(domainColor(1, 0)).not.toEqual(domainColor(-1, 0));
	});
});

describe('distanceEstimate', () => {
	it('is zero when the derivative vanishes (guard)', () => {
		expect(distanceEstimate(10, 0)).toBe(0);
	});
	it('grows with |z| and shrinks with derivative magnitude', () => {
		const near = distanceEstimate(300, 1000); // big derivative → near boundary
		const far = distanceEstimate(300, 10); // small derivative → far from boundary
		expect(far).toBeGreaterThan(near);
		expect(near).toBeGreaterThan(0);
	});
});

describe('mandelbrotColorData', () => {
	it('marks the origin as interior with a zero trap and minZ', () => {
		const d = mandelbrotColorData(0, 0, 200);
		expect(d.escaped).toBe(false);
		expect(d.trap).toBe(0); // the orbit sits on both axes
		expect(d.minZ).toBe(0);
	});

	it('escapes a far point with a finite, positive derivative', () => {
		const d = mandelbrotColorData(2, 2, 200);
		expect(d.escaped).toBe(true);
		expect(d.derivMag).toBeGreaterThan(0);
		expect(Number.isFinite(d.derivMag)).toBe(true);
		// A finite distance estimate falls out of |z| and the derivative.
		expect(distanceEstimate(Math.hypot(d.zx, d.zy), d.derivMag)).toBeGreaterThan(0);
	});

	it('excludes the seed z₀ = 0 so the trap is not uniformly zero off the axes', () => {
		// Two distinct off-axis points must give distinct, positive traps — the bug
		// where every orbit starts at 0 (trap pinned to 0) would make these equal.
		const a = mandelbrotColorData(0.36, 0.42, 200);
		const b = mandelbrotColorData(-0.62, 0.55, 200);
		expect(a.trap).toBeGreaterThan(0);
		expect(b.trap).toBeGreaterThan(0);
		expect(a.trap).not.toBeCloseTo(b.trap, 5);
	});

	it('keeps the trap bounded and non-negative everywhere', () => {
		for (const [x, y] of [
			[-0.5, 0],
			[0.28, 0.008],
			[-0.75, 0.1]
		]) {
			const d = mandelbrotColorData(x, y, 300);
			expect(d.trap).toBeGreaterThanOrEqual(0);
			expect(d.minZ).toBeGreaterThanOrEqual(0);
		}
	});
});
