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
import { type DD, fromNumber, toNumber, add, sub, neg, sqr, mul, mulNumber, absDD } from '$lib/engine/dd';

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
