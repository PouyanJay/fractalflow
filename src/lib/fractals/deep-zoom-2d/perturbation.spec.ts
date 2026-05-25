import { describe, it, expect } from 'vitest';
import { computeReferenceOrbit, perturbEscape } from './perturbation';
import { mandelbrotEscape } from './reference';

describe('perturbation vs direct iteration (both f64 — must match exactly)', () => {
	const cx = -0.5;
	const cy = 0;
	const maxIter = 500;
	const orbit = computeReferenceOrbit(cx, cy, maxIter);

	const samples: Array<[number, number]> = [
		[-0.4, 0.1],
		[-0.6, -0.2],
		[-0.75, 0.06],
		[0.27, 0.53],
		[-1.0, 0.0]
	];

	for (const [x, y] of samples) {
		it(`matches direct escape at (${x}, ${y})`, () => {
			const direct = mandelbrotEscape(x, y, maxIter);
			const pert = perturbEscape(orbit, x - cx, y - cy, maxIter);
			expect(pert.escaped).toBe(direct.escaped);
			expect(pert.iter).toBe(direct.iter);
		});
	}

	it('keeps the reference center inside the set (delta = 0)', () => {
		expect(perturbEscape(orbit, 0, 0, maxIter).escaped).toBe(false);
	});
});

describe('computeReferenceOrbit', () => {
	it('records Z0 = 0 and never exceeds maxIter + 1 samples', () => {
		const o = computeReferenceOrbit(-0.5, 0, 100);
		expect(o.xs[0]).toBe(0);
		expect(o.ys[0]).toBe(0);
		expect(o.length).toBeGreaterThan(0);
		expect(o.length).toBeLessThanOrEqual(101);
	});

	it('stops early when the reference point escapes', () => {
		// (2,2) escapes almost immediately, so the orbit is short.
		const o = computeReferenceOrbit(2, 2, 500);
		expect(o.length).toBeLessThan(10);
	});
});
