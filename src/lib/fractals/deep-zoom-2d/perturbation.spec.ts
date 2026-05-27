import { describe, it, expect } from 'vitest';
import {
	computeReferenceOrbit,
	computeReferenceOrbitDD,
	computeSeriesApprox,
	perturbEscape,
	type ReferenceOrbit,
	type SeriesApprox
} from './perturbation';
import { mandelbrotEscape, juliaEscape, tricornEscape, burningShipEscape } from './reference';
import { fromNumber, add } from '$lib/engine/dd';
import type { FormulaId } from '$lib/engine/types';

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
		const f64 = computeReferenceOrbit(-0.743643887, 0.1318259, 400);
		const dd = computeReferenceOrbitDD(
			'mandelbrot',
			fromNumber(-0.743643887),
			fromNumber(0.1318259),
			0,
			0,
			400
		);
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
		const b = computeReferenceOrbitDD(
			'mandelbrot',
			add(fromNumber(cx), fromNumber(1e-25)),
			fromNumber(cy),
			0,
			0,
			3000
		);
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
		const orbit = computeReferenceOrbitDD(
			'burning-ship',
			fromNumber(cx),
			fromNumber(cy),
			0,
			0,
			maxIter
		);
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

// --- Series approximation (skip the early, well-approximated iterations) ------

/**
 * Reference truth for the series: iterate the per-pixel delta with NO rebasing,
 * so δ_n stays anchored to the absolute reference index n (the same thing the
 * Taylor series δ_n = A1·δc + A2·δc² + A3·δc³ approximates). Mandelbrot/Julia
 * only — the two analytic formulas series approximation supports.
 */
function deltaAtNoRebase(
	formula: FormulaId,
	orbit: ReferenceOrbit,
	dcx: number,
	dcy: number,
	n: number
): { x: number; y: number } {
	let dx = formula === 'julia' ? dcx : 0;
	let dy = formula === 'julia' ? dcy : 0;
	for (let k = 0; k < n; k++) {
		const Zx = orbit.xs[k];
		const Zy = orbit.ys[k];
		const wx = 2 * (Zx * dx - Zy * dy) + (dx * dx - dy * dy);
		const wy = 2 * (Zx * dy + Zy * dx) + 2 * dx * dy;
		if (formula === 'julia') {
			dx = wx;
			dy = wy;
		} else {
			dx = wx + dcx;
			dy = wy + dcy;
		}
	}
	return { x: dx, y: dy };
}

/** Evaluate the truncated series δ ≈ A1·δc + A2·δc² + A3·δc³ (mirrors the shader). */
function evalSeries(s: SeriesApprox, dcx: number, dcy: number): { x: number; y: number } {
	const dc2x = dcx * dcx - dcy * dcy;
	const dc2y = 2 * dcx * dcy;
	const dc3x = dc2x * dcx - dc2y * dcy;
	const dc3y = dc2x * dcy + dc2y * dcx;
	return {
		x: s.a1x * dcx - s.a1y * dcy + (s.a2x * dc2x - s.a2y * dc2y) + (s.a3x * dc3x - s.a3y * dc3y),
		y: s.a1x * dcy + s.a1y * dcx + (s.a2x * dc2y + s.a2y * dc2x) + (s.a3x * dc3y + s.a3y * dc3x)
	};
}

describe('computeSeriesApprox — coefficient correctness', () => {
	// Deep-ish boundary spiral; nearby pixels escape, so the series genuinely
	// breaks down at a finite iteration (exercises the skip-selection logic).
	const cx = -0.743643887037151;
	const cy = 0.13182590420533;
	const maxIter = 2000;

	it('Mandelbrot: series δ at the skip matches non-rebased iteration (incl. the corner)', () => {
		const orbit = computeReferenceOrbitDD(
			'mandelbrot',
			fromNumber(cx),
			fromNumber(cy),
			0,
			0,
			maxIter
		);
		const r = 1e-7;
		const s = computeSeriesApprox('mandelbrot', orbit, r, maxIter);
		expect(s.skip).toBeGreaterThan(0);
		// Corner (max |δc|) plus interior probes — the series must reproduce the
		// true δ at iteration `skip` to a small fraction of the view radius.
		for (const [dx, dy] of [
			[r * Math.SQRT1_2, r * Math.SQRT1_2],
			[-r * Math.SQRT1_2, r * Math.SQRT1_2],
			[r * 0.4, -r * 0.2],
			[0, -r]
		]) {
			const truth = deltaAtNoRebase('mandelbrot', orbit, dx, dy, s.skip);
			const approx = evalSeries(s, dx, dy);
			const err = Math.hypot(approx.x - truth.x, approx.y - truth.y);
			expect(err).toBeLessThan(1e-3 * (Math.hypot(truth.x, truth.y) + r));
		}
	});

	it('Julia: series δ at the skip matches non-rebased iteration', () => {
		const [jx, jy, sx, sy] = [0.15, 0.2, -0.8, 0.156];
		const orbit = computeReferenceOrbitDD('julia', fromNumber(jx), fromNumber(jy), sx, sy, maxIter);
		const r = 1e-6;
		const s = computeSeriesApprox('julia', orbit, r, maxIter);
		expect(s.skip).toBeGreaterThan(0);
		for (const [dx, dy] of [
			[r * Math.SQRT1_2, r * Math.SQRT1_2],
			[-r * 0.5, r * 0.3],
			[0, -r]
		]) {
			const truth = deltaAtNoRebase('julia', orbit, dx, dy, s.skip);
			const approx = evalSeries(s, dx, dy);
			const err = Math.hypot(approx.x - truth.x, approx.y - truth.y);
			expect(err).toBeLessThan(1e-3 * (Math.hypot(truth.x, truth.y) + r));
		}
	});
});

describe('computeSeriesApprox — skip selection is conservative & well-behaved', () => {
	const cx = -0.743643887037151;
	const cy = 0.13182590420533;
	const maxIter = 2000;
	const orbit = computeReferenceOrbitDD(
		'mandelbrot',
		fromNumber(cx),
		fromNumber(cy),
		0,
		0,
		maxIter
	);

	it('skips more iterations the deeper the zoom (smaller view radius)', () => {
		const shallow = computeSeriesApprox('mandelbrot', orbit, 1e-4, maxIter);
		const deep = computeSeriesApprox('mandelbrot', orbit, 1e-9, maxIter);
		expect(deep.skip).toBeGreaterThanOrEqual(shallow.skip);
	});

	it('does not skip when the view is wide (series breaks down immediately)', () => {
		const s = computeSeriesApprox('mandelbrot', orbit, 0.5, maxIter);
		expect(s.skip).toBe(0);
	});

	it('never skips for the non-analytic formulas (no clean univariate series)', () => {
		const tri = computeReferenceOrbitDD('tricorn', fromNumber(-0.2), fromNumber(0.7), 0, 0, 500);
		const bs = computeReferenceOrbitDD(
			'burning-ship',
			fromNumber(-0.45),
			fromNumber(-0.55),
			0,
			0,
			500
		);
		expect(computeSeriesApprox('tricorn', tri, 1e-9, 500).skip).toBe(0);
		expect(computeSeriesApprox('burning-ship', bs, 1e-9, 500).skip).toBe(0);
	});

	it('keeps the skip within the reference orbit bounds', () => {
		const s = computeSeriesApprox('mandelbrot', orbit, 1e-12, maxIter);
		expect(s.skip).toBeLessThanOrEqual(orbit.length - 2);
		expect(s.skip).toBeLessThanOrEqual(maxIter);
	});
});
