import { describe, it, expect } from 'vitest';
import { computeReferenceOrbit, computeReferenceOrbitDD, perturbEscape } from './perturbation';
import { mandelbrotEscape, juliaEscape, tricornEscape, burningShipEscape } from './reference';
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
			const pert = perturbEscape('mandelbrot', orbit, x - cx, y - cy, maxIter);
			expect(pert.escaped).toBe(direct.escaped);
			expect(pert.iter).toBe(direct.iter);
		});
	}

	it('keeps the reference center inside the set (delta = 0)', () => {
		expect(perturbEscape('mandelbrot', orbit, 0, 0, maxIter).escaped).toBe(false);
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
		const o = computeReferenceOrbit(2, 2, 500);
		expect(o.length).toBeLessThan(10);
	});
});

describe('computeReferenceOrbitDD', () => {
	it('matches the f64 orbit when the centre has no sub-f64 tail', () => {
		const f64 = computeReferenceOrbit(-0.743643887, 0.13182590, 400);
		const dd = computeReferenceOrbitDD('mandelbrot', fromNumber(-0.743643887), fromNumber(0.13182590), 0, 0, 400);
		expect(dd.length).toBe(f64.length);
		for (let i = 0; i < f64.length; i++) {
			expect(dd.xs[i]).toBeCloseTo(f64.xs[i], 10);
			expect(dd.ys[i]).toBeCloseTo(f64.ys[i], 10);
		}
	});

	it('resolves a centre difference far below f64 ulp that f64 cannot', () => {
		const cx = -0.743643887037151;
		const cy = 0.13182590420533;
		expect(cx + 1e-25).toBe(cx); // f64 can't even hold the difference
		const a = computeReferenceOrbitDD('mandelbrot', fromNumber(cx), fromNumber(cy), 0, 0, 3000);
		const b = computeReferenceOrbitDD('mandelbrot', add(fromNumber(cx), fromNumber(1e-25)), fromNumber(cy), 0, 0, 3000);
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

	it('Julia orbit starts at the centre and iterates with the seed', () => {
		const o = computeReferenceOrbitDD('julia', fromNumber(0.2), fromNumber(0.3), -0.8, 0.156, 50);
		expect(o.xs[0]).toBeCloseTo(0.2, 12);
		expect(o.ys[0]).toBeCloseTo(0.3, 12);
		// Z1 = Z0² + seed
		expect(o.xs[1]).toBeCloseTo(0.2 * 0.2 - 0.3 * 0.3 - 0.8, 12);
		expect(o.ys[1]).toBeCloseTo(2 * 0.2 * 0.3 + 0.156, 12);
	});
});

describe('perturbation matches direct iteration for every formula', () => {
	const maxIter = 500;

	it('Julia (analytic — exact)', () => {
		const [cx, cy, sx, sy] = [0.15, 0.2, -0.8, 0.156];
		const orbit = computeReferenceOrbitDD('julia', fromNumber(cx), fromNumber(cy), sx, sy, maxIter);
		for (const [ox, oy] of [
			[0.02, 0.0],
			[-0.03, 0.05],
			[0.0, -0.04],
			[0.06, 0.06]
		]) {
			const direct = juliaEscape(cx + ox, cy + oy, sx, sy, maxIter);
			const pert = perturbEscape('julia', orbit, ox, oy, maxIter);
			expect(pert.escaped).toBe(direct.escaped);
			expect(pert.iter).toBe(direct.iter);
		}
	});

	it('Tricorn (analytic — exact)', () => {
		const [cx, cy] = [-0.2, 0.7];
		const orbit = computeReferenceOrbitDD('tricorn', fromNumber(cx), fromNumber(cy), 0, 0, maxIter);
		for (const [ox, oy] of [
			[0.03, 0.0],
			[-0.04, 0.05],
			[0.0, -0.05],
			[0.07, -0.03]
		]) {
			const direct = tricornEscape(cx + ox, cy + oy, maxIter);
			const pert = perturbEscape('tricorn', orbit, ox, oy, maxIter);
			expect(pert.escaped).toBe(direct.escaped);
			expect(pert.iter).toBe(direct.iter);
		}
	});

	it('Burning Ship (sign form — exact while the deltas stay small, i.e. away from the axes)', () => {
		const [cx, cy] = [-0.45, -0.55]; // both coords clearly off-axis
		const orbit = computeReferenceOrbitDD('burning-ship', fromNumber(cx), fromNumber(cy), 0, 0, maxIter);
		// Deep-zoom regime: tiny per-pixel offsets keep the reference's signs.
		for (const [ox, oy] of [
			[1e-6, 0],
			[-1e-6, 1e-6],
			[0, -2e-6],
			[1.5e-6, -1e-6]
		]) {
			const direct = burningShipEscape(cx + ox, cy + oy, maxIter);
			const pert = perturbEscape('burning-ship', orbit, ox, oy, maxIter);
			expect(pert.escaped).toBe(direct.escaped);
			expect(pert.iter).toBe(direct.iter);
		}
	});
});
