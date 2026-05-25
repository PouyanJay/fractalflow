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

/** Iterate the per-pixel delta against a reference orbit. */
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
	const limit = Math.min(orbit.length, maxIter + 1);
	for (let n = 0; n < limit; n++) {
		const zx = orbit.xs[n] + dx;
		const zy = orbit.ys[n] + dy;
		if (zx * zx + zy * zy > r2) {
			const logZn = Math.log(zx * zx + zy * zy) / 2;
			const nu = Math.log(logZn / Math.LN2) / Math.LN2;
			return { escaped: true, iter: n, smooth: n + 1 - nu };
		}
		if (n >= maxIter) break;
		const Zx = orbit.xs[n];
		const Zy = orbit.ys[n];
		// δ' = 2·Z·δ + δ² + δc  (complex)
		const ndx = 2 * (Zx * dx - Zy * dy) + (dx * dx - dy * dy) + dcx;
		const ndy = 2 * (Zx * dy + Zy * dx) + 2 * dx * dy + dcy;
		dx = ndx;
		dy = ndy;
	}
	return { escaped: false, iter: maxIter, smooth: maxIter };
}
