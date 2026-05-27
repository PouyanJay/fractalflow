/**
 * Perturbation theory for deep zoom (all four Deep-Zoom 2D formulas).
 *
 * Instead of evaluating the iteration directly (which loses precision once the
 * view is smaller than f32 can resolve around an O(1) center), we compute one
 * high-precision *reference orbit* Z_n, then iterate a small per-pixel delta
 * δ_n = z_n − Z_n. With the shared increment w = 2·Z_n·δ_n + δ_n², the four
 * formulas differ only in how δ_{n+1} is assembled (δc = c_pixel − c_ref):
 *
 *   Mandelbrot    δ' = w + δc
 *   Julia         δ' = w           (δ starts at δc; reference starts at centre)
 *   Tricorn       δ' = conj(w) + δc
 *   Burning Ship  δ' = (w.x + δc.x,  sign(Z.x)·sign(Z.y)·w.y + δc.y)
 *
 * Burning Ship's |·| is non-analytic; the sign form is exact while a pixel's
 * orbit keeps the reference's signs (away from the axes) and is the source of
 * its glitches near them. δc and δ stay small, so the GPU carries them in f32;
 * the reference orbit holds the precision. This module is the CPU oracle the
 * shader mirrors. f64/double-double here; the GPU uses an f32 copy of the orbit.
 */
import type { EscapeResult } from './reference';
import type { FormulaId } from '$lib/engine/types';
import {
	type DD,
	fromNumber,
	toNumber,
	add,
	sub,
	neg,
	sqr,
	mul,
	mulNumber,
	absDD
} from '$lib/engine/dd';

export interface ReferenceOrbit {
	xs: Float64Array;
	ys: Float64Array;
	/** Number of valid samples (Z_0 … Z_{length-1}). */
	length: number;
}

const DEFAULT_BAILOUT_RADIUS = 256;

/** Iterate the reference point in f64, recording Z_n until escape or maxIter. */
export function computeReferenceOrbit(
	cx: number,
	cy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): ReferenceOrbit {
	const r2 = bailoutRadius * bailoutRadius;
	const xs = new Float64Array(maxIter + 1);
	const ys = new Float64Array(maxIter + 1);
	let zx = 0;
	let zy = 0;
	let n = 0;
	for (; n <= maxIter; n++) {
		xs[n] = zx;
		ys[n] = zy;
		if (zx * zx + zy * zy > r2 || n === maxIter) {
			n++;
			break;
		}
		const nzx = zx * zx - zy * zy + cx;
		const nzy = 2 * zx * zy + cy;
		zx = nzx;
		zy = nzy;
	}
	return { xs, ys, length: n };
}

/**
 * Reference orbit at a centre carried in **double-double** precision, for any of
 * the four formulas. The centre and the z iteration run in DD so a sub-f64 tail
 * on the centre (the extra ~15 digits that place the view past ~1e10×) actually
 * influences the orbit; samples are stored back as f64 — all the GPU needs
 * (rebasing makes the stored precision uncritical). For Julia the orbit starts
 * at the view centre and iterates with the fixed `seed`; otherwise it starts at
 * 0 and iterates with `c` = the centre.
 */
export function computeReferenceOrbitDD(
	formula: FormulaId,
	cx: DD,
	cy: DD,
	seedX: number,
	seedY: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): ReferenceOrbit {
	const r2 = bailoutRadius * bailoutRadius;
	const xs = new Float64Array(maxIter + 1);
	const ys = new Float64Array(maxIter + 1);
	const julia = formula === 'julia';
	const ccx = julia ? fromNumber(seedX) : cx;
	const ccy = julia ? fromNumber(seedY) : cy;
	let zx = julia ? cx : fromNumber(0);
	let zy = julia ? cy : fromNumber(0);
	let n = 0;
	for (; n <= maxIter; n++) {
		const fx = toNumber(zx);
		const fy = toNumber(zy);
		xs[n] = fx;
		ys[n] = fy;
		if (fx * fx + fy * fy > r2 || n === maxIter) {
			n++;
			break;
		}
		if (formula === 'burning-ship') {
			// z' = (|x| + i|y|)² + c
			const ax = absDD(zx);
			const ay = absDD(zy);
			zx = add(sub(sqr(ax), sqr(ay)), ccx);
			zy = add(mulNumber(mul(ax, ay), 2), ccy);
		} else if (formula === 'tricorn') {
			// z' = conj(z)² + c  →  real = x²−y²+cx, imag = −2xy+cy
			const nzx = add(sub(sqr(zx), sqr(zy)), ccx);
			const nzy = add(neg(mulNumber(mul(zx, zy), 2)), ccy);
			zx = nzx;
			zy = nzy;
		} else {
			// Mandelbrot / Julia: z' = z² + c
			const nzx = add(sub(sqr(zx), sqr(zy)), ccx);
			const nzy = add(mulNumber(mul(zx, zy), 2), ccy);
			zx = nzx;
			zy = nzy;
		}
	}
	return { xs, ys, length: n };
}

/**
 * Series-approximation coefficients for the per-pixel delta, evaluated at the
 * skip iteration. The shader initialises δ at iteration `skip` directly from the
 * Taylor expansion δ ≈ A1·δc + A2·δc² + A3·δc³ instead of iterating from 0,
 * skipping the early iterations where δ is tiny and the series is exact. A1/A2/A3
 * are complex (x = real, y = imag); `skip` of 0 means "no skip — iterate from 0".
 */
export interface SeriesApprox {
	skip: number;
	a1x: number;
	a1y: number;
	a2x: number;
	a2y: number;
	a3x: number;
	a3y: number;
}

/** The "no skip" result: iterate from 0, no series coefficients. */
export const ZERO_SERIES: SeriesApprox = {
	skip: 0,
	a1x: 0,
	a1y: 0,
	a2x: 0,
	a2y: 0,
	a3x: 0,
	a3y: 0
};

const fr = Math.fround;

// Relative error a probe may accumulate before the truncated series is declared
// broken, and the fraction of the last-good iteration we actually keep as a
// margin. The probe series is evaluated in **f32** (mirroring the GPU's cmul
// chain) against the f64-exact delta, so selection stops the moment the GPU's
// own f32 evaluation would start to drift — not just when the maths truncates.
// This is the real safety constraint: pushing the skip past where the f32 cubic
// stays accurate sends boundary pixels to the wrong escape band (verified against
// an f64 oracle — accuracy is neutral up to that point, then degrades). 1e-5 sits
// ~100× above the f32 noise floor and ~100× below the band-flip scale.
// Under-skipping only costs speed; both knobs stay deliberately conservative.
const SERIES_TOL = 1e-5;
const SERIES_SAFETY = 0.85;
// Below this the series-init overhead (a cubic evaluation per pixel) isn't worth
// it, so fall back to iterating from 0.
const MIN_SKIP = 8;
// Directions probed around the view's bounding circle. The corner radius is the
// view's largest |δc|; sampling several angles catches the fastest-growing one.
const PROBE_DIRS = 8;

/**
 * Choose how many leading iterations the per-pixel delta loop can skip via a
 * Taylor series in δc, and the series coefficients at that iteration. Only the
 * analytic Mandelbrot/Julia recurrences (δ' = 2Zδ + δ² [+δc]) have a clean
 * univariate series; Tricorn's conjugation and Burning Ship's |·| do not, so
 * they return `skip = 0` and iterate from 0 as before.
 *
 * The coefficient recurrences (δ_n = A1ₙ·δc + A2ₙ·δc² + A3ₙ·δc³):
 *   Mandelbrot (δ₀ = 0):  A1' = 2Z·A1 + 1,  A2' = 2Z·A2 + A1²,  A3' = 2Z·A3 + 2·A1·A2
 *   Julia      (δ₀ = δc): A1₀ = 1; A1' = 2Z·A1,  A2'/A3' as above
 *
 * `maxRadius` is the largest |δc| in the view (a frame corner). Skip selection
 * walks the iterations, probing a ring at that radius, and stops at the first
 * iteration where any probe's series prediction drifts past SERIES_TOL from the
 * true (non-rebased) delta — then backs off by SERIES_SAFETY.
 */
export function computeSeriesApprox(
	formula: FormulaId,
	orbit: ReferenceOrbit,
	maxRadius: number,
	maxIter: number
): SeriesApprox {
	if ((formula !== 'mandelbrot' && formula !== 'julia') || maxRadius <= 0 || orbit.length < 3) {
		return ZERO_SERIES;
	}
	const julia = formula === 'julia';

	// Probe points on the bounding circle (max |δc|), and their true non-rebased
	// deltas iterated alongside the coefficients.
	const probeDcx = new Float64Array(PROBE_DIRS);
	const probeDcy = new Float64Array(PROBE_DIRS);
	const probeDx = new Float64Array(PROBE_DIRS);
	const probeDy = new Float64Array(PROBE_DIRS);
	for (let p = 0; p < PROBE_DIRS; p++) {
		const a = (2 * Math.PI * p) / PROBE_DIRS;
		probeDcx[p] = maxRadius * Math.cos(a);
		probeDcy[p] = maxRadius * Math.sin(a);
		probeDx[p] = julia ? probeDcx[p] : 0;
		probeDy[p] = julia ? probeDcy[p] : 0;
	}

	// Coefficients of δ_n in δc, stepped alongside the probes.
	const co = newCoeffs(julia);
	let lastGood = -1;

	const nMax = Math.min(maxIter, orbit.length - 2);
	for (let n = 0; n <= nMax; n++) {
		// Does the current series still predict every probe's true delta at n?
		// Evaluate it in f32, coefficients included, exactly as the shader's cmul
		// chain does (the coefficients are uploaded as f32 too), so the probe sees
		// the GPU's real arithmetic — not a more forgiving f64 version.
		const a1x = fr(co.a1x);
		const a1y = fr(co.a1y);
		const a2x = fr(co.a2x);
		const a2y = fr(co.a2y);
		const a3x = fr(co.a3x);
		const a3y = fr(co.a3y);
		let ok = true;
		for (let p = 0; p < PROBE_DIRS; p++) {
			const ox = fr(probeDcx[p]);
			const oy = fr(probeDcy[p]);
			const d2x = fr(fr(ox * ox) - fr(oy * oy));
			const d2y = fr(fr(ox * oy) + fr(oy * ox));
			const d3x = fr(fr(d2x * ox) - fr(d2y * oy));
			const d3y = fr(fr(d2x * oy) + fr(d2y * ox));
			const t1x = fr(fr(a1x * ox) - fr(a1y * oy));
			const t1y = fr(fr(a1x * oy) + fr(a1y * ox));
			const t2x = fr(fr(a2x * d2x) - fr(a2y * d2y));
			const t2y = fr(fr(a2x * d2y) + fr(a2y * d2x));
			const t3x = fr(fr(a3x * d3x) - fr(a3y * d3y));
			const t3y = fr(fr(a3x * d3y) + fr(a3y * d3x));
			const sx = fr(fr(t1x + t2x) + t3x);
			const sy = fr(fr(t1y + t2y) + t3y);
			const errMag = Math.hypot(sx - probeDx[p], sy - probeDy[p]);
			const trueMag = Math.hypot(probeDx[p], probeDy[p]);
			if (trueMag > 1e-200 && errMag > SERIES_TOL * trueMag) {
				ok = false;
				break;
			}
		}
		if (!ok) break; // monotone breakdown; coefficients only diverge further
		lastGood = n;

		const Zx = orbit.xs[n];
		const Zy = orbit.ys[n];
		stepCoeffs(co, julia, Zx, Zy);
		for (let p = 0; p < PROBE_DIRS; p++) {
			const dx = probeDx[p];
			const dy = probeDy[p];
			const wx = 2 * (Zx * dx - Zy * dy) + (dx * dx - dy * dy);
			const wy = 2 * (Zx * dy + Zy * dx) + 2 * dx * dy;
			probeDx[p] = julia ? wx : wx + probeDcx[p];
			probeDy[p] = julia ? wy : wy + probeDcy[p];
		}
	}

	const skip = Math.floor(Math.max(0, lastGood) * SERIES_SAFETY);
	if (skip < MIN_SKIP) return ZERO_SERIES;
	// Coefficients exactly at `skip` (≤ lastGood, so always finite). The snapshot
	// is at lastGood, not skip, so replay the cheap recurrence to skip.
	const at = newCoeffs(julia);
	for (let n = 0; n < skip; n++) stepCoeffs(at, julia, orbit.xs[n], orbit.ys[n]);
	return { skip, a1x: at.a1x, a1y: at.a1y, a2x: at.a2x, a2y: at.a2y, a3x: at.a3x, a3y: at.a3y };
}

interface Coeffs {
	a1x: number;
	a1y: number;
	a2x: number;
	a2y: number;
	a3x: number;
	a3y: number;
}

/** Initial Taylor coefficients: A1₀ = 1 for Julia (δ₀ = δc), 0 for Mandelbrot (δ₀ = 0). */
function newCoeffs(julia: boolean): Coeffs {
	return { a1x: julia ? 1 : 0, a1y: 0, a2x: 0, a2y: 0, a3x: 0, a3y: 0 };
}

/** Advance the coefficients one reference step: A1' = 2Z·A1 (+1), A2' = 2Z·A2 + A1², A3' = 2Z·A3 + 2A1A2. */
function stepCoeffs(c: Coeffs, julia: boolean, Zx: number, Zy: number): void {
	const n1x = 2 * (Zx * c.a1x - Zy * c.a1y) + (julia ? 0 : 1);
	const n1y = 2 * (Zx * c.a1y + Zy * c.a1x);
	const n2x = 2 * (Zx * c.a2x - Zy * c.a2y) + (c.a1x * c.a1x - c.a1y * c.a1y);
	const n2y = 2 * (Zx * c.a2y + Zy * c.a2x) + 2 * c.a1x * c.a1y;
	const n3x = 2 * (Zx * c.a3x - Zy * c.a3y) + 2 * (c.a1x * c.a2x - c.a1y * c.a2y);
	const n3y = 2 * (Zx * c.a3y + Zy * c.a3x) + 2 * (c.a1x * c.a2y + c.a1y * c.a2x);
	c.a1x = n1x;
	c.a1y = n1y;
	c.a2x = n2x;
	c.a2y = n2y;
	c.a3x = n3x;
	c.a3y = n3y;
}

/**
 * Iterate the per-pixel delta against a reference orbit, with **rebasing**
 * (Zhuoran's method): whenever the true |z| drops below |δ| — or the reference
 * is exhausted — restart the reference at index 0 with δ := z − Z₀. This keeps δ
 * small relative to the reference and lets a single reference render the whole
 * view without glitches, including exterior regions and very deep zooms. The
 * per-formula δ assembly mirrors the module header (and the shader).
 */
export function perturbEscape(
	formula: FormulaId,
	orbit: ReferenceOrbit,
	dcx: number,
	dcy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	const z0x = orbit.xs[0];
	const z0y = orbit.ys[0];
	// Julia carries the perturbation through the initial delta (no per-step δc);
	// the others start at 0 and add δc each step.
	let dx = formula === 'julia' ? dcx : 0;
	let dy = formula === 'julia' ? dcy : 0;
	let ref = 0;
	for (let iter = 0; iter < maxIter; iter++) {
		const Zx = orbit.xs[ref];
		const Zy = orbit.ys[ref];
		// Shared increment w = 2·Z·δ + δ².
		const wx = 2 * (Zx * dx - Zy * dy) + (dx * dx - dy * dy);
		const wy = 2 * (Zx * dy + Zy * dx) + 2 * dx * dy;
		if (formula === 'julia') {
			dx = wx;
			dy = wy;
		} else if (formula === 'tricorn') {
			dx = wx + dcx;
			dy = -wy + dcy;
		} else if (formula === 'burning-ship') {
			const s = Math.sign(Zx) * Math.sign(Zy);
			dx = wx + dcx;
			dy = s * wy + dcy;
		} else {
			dx = wx + dcx;
			dy = wy + dcy;
		}
		ref++;
		const zx = orbit.xs[ref] + dx;
		const zy = orbit.ys[ref] + dy;
		const zmag = zx * zx + zy * zy;
		if (zmag > r2) {
			const logZn = Math.log(zmag) / 2;
			const nu = Math.log(logZn / Math.LN2) / Math.LN2;
			return { escaped: true, iter: iter + 1, smooth: iter + 2 - nu };
		}
		if (zmag < dx * dx + dy * dy || ref >= orbit.length - 1) {
			dx = zx - z0x;
			dy = zy - z0y;
			ref = 0;
		}
	}
	return { escaped: false, iter: maxIter, smooth: maxIter };
}
