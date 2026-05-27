/**
 * Perturbation theory for deep zoom (Mandelbrot).
 *
 * Instead of evaluating z := z² + c directly (which loses precision once the
 * view is smaller than f32 can resolve around an O(1) center), we compute one
 * high-precision *reference orbit* Z_n at the view center, then iterate a small
 * per-pixel delta:
 *
 *   z_n = Z_n + δ_n,   δ_{n+1} = 2·Z_n·δ_n + δ_n² + δc,   δc = c_pixel − c_ref
 *
 * δc and δ stay small, so the GPU can carry them in f32 even at extreme zoom;
 * the reference orbit holds the precision. This module is the CPU oracle: it is
 * mathematically identical to direct iteration (validated in the spec) and the
 * source the shader mirrors. f64 here; the GPU uses an f32 copy of the orbit.
 */
import type { EscapeResult } from './reference';
import { type DD, fromNumber, toNumber, add, sub, sqr, mul, mulNumber } from '$lib/engine/dd';

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
 * Reference orbit at a centre carried in **double-double** precision. Identical
 * to `computeReferenceOrbit` but the centre and the z iteration run in DD, so a
 * sub-f64 tail on the centre (the extra ~15 digits that place the view past
 * ~1e10×) actually influences the orbit. The samples are stored back as f64 —
 * that's all the GPU needs (rebasing makes the stored precision uncritical); it
 * is the *computation* that must be high-precision.
 */
export function computeReferenceOrbitDD(
	cx: DD,
	cy: DD,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): ReferenceOrbit {
	const r2 = bailoutRadius * bailoutRadius;
	const xs = new Float64Array(maxIter + 1);
	const ys = new Float64Array(maxIter + 1);
	let zx = fromNumber(0);
	let zy = fromNumber(0);
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
		// z' = z² + c  (complex): zx' = zx² − zy² + cx, zy' = 2·zx·zy + cy
		const nzx = add(sub(sqr(zx), sqr(zy)), cx);
		const nzy = add(mulNumber(mul(zx, zy), 2), cy);
		zx = nzx;
		zy = nzy;
	}
	return { xs, ys, length: n };
}

/**
 * Iterate the per-pixel delta against a reference orbit, with **rebasing**
 * (Zhuoran's method): whenever the true |z| drops below |δ| — or the reference
 * is exhausted — restart the reference at index 0 with δ := z. This keeps δ
 * small relative to the reference and lets a single reference render the whole
 * view without glitches, including exterior regions and very deep zooms.
 */
export function perturbEscape(
	orbit: ReferenceOrbit,
	dcx: number,
	dcy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let dx = 0;
	let dy = 0;
	let ref = 0;
	for (let iter = 0; iter < maxIter; iter++) {
		const Zx = orbit.xs[ref];
		const Zy = orbit.ys[ref];
		// δ' = 2·Z·δ + δ² + δc  (complex)
		const ndx = 2 * (Zx * dx - Zy * dy) + (dx * dx - dy * dy) + dcx;
		const ndy = 2 * (Zx * dy + Zy * dx) + 2 * dx * dy + dcy;
		dx = ndx;
		dy = ndy;
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
			dx = zx;
			dy = zy;
			ref = 0;
		}
	}
	return { escaped: false, iter: maxIter, smooth: maxIter };
}
