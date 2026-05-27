import { describe, it, expect } from 'vitest';
import { computeReferenceOrbit, computeReferenceOrbitDD, perturbEscape } from './perturbation';
import { mandelbrotEscape } from './reference';
import { fromNumber, add } from '$lib/engine/dd';

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

describe('computeReferenceOrbitDD', () => {
	it('matches the f64 orbit when the centre has no sub-f64 tail', () => {
		const f64 = computeReferenceOrbit(-0.743643887, 0.13182590, 400);
		const dd = computeReferenceOrbitDD(fromNumber(-0.743643887), fromNumber(0.13182590), 400);
		expect(dd.length).toBe(f64.length);
		for (let i = 0; i < f64.length; i++) {
			expect(dd.xs[i]).toBeCloseTo(f64.xs[i], 10);
			expect(dd.ys[i]).toBeCloseTo(f64.ys[i], 10);
		}
	});

	it('resolves a centre difference far below f64 ulp that f64 cannot', () => {
		// A deep boundary point (long, sensitive orbit). 1e-25 is well under
		// ulp(0.743…) ≈ 1.1e-16, so as plain f64 the two centres are bit-identical;
		// only the DD tail makes the orbits diverge as the perturbation amplifies.
		const cx = -0.743643887037151;
		const cy = 0.13182590420533;
		expect(cx + 1e-25).toBe(cx); // f64 can't even hold the difference
		const a = computeReferenceOrbitDD(fromNumber(cx), fromNumber(cy), 3000);
		const b = computeReferenceOrbitDD(add(fromNumber(cx), fromNumber(1e-25)), fromNumber(cy), 3000);
		let diverged = false;
		const n = Math.min(a.length, b.length);
		for (let i = 0; i < n; i++) {
			if (a.xs[i] !== b.xs[i] || a.ys[i] !== b.ys[i]) {
				diverged = true;
				break;
			}
		}
		expect(diverged).toBe(true);
	});
});
