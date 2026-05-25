/**
 * CPU reference implementations for the Deep-Zoom 2D renderer's escape-time
 * formulas. These are the oracle the GPU shaders are checked against and the
 * source of truth for the math. f64 here; the shaders mirror this in f32.
 */
import type { FormulaId } from '$lib/engine/types';

export interface EscapeResult {
	escaped: boolean;
	/** Integer iteration at escape (or maxIter when inside). */
	iter: number;
	/** Continuous (smooth) iteration count for banding-free coloring. */
	smooth: number;
}

const DEFAULT_BAILOUT_RADIUS = 256;

/** Continuous iteration count from the escape iteration and the final z. */
function smoothCount(i: number, finalX: number, finalY: number): number {
	const logZn = Math.log(finalX * finalX + finalY * finalY) / 2;
	const nu = Math.log(logZn / Math.LN2) / Math.LN2;
	return i + 1 - nu;
}

/** Mandelbrot: iterate z := z² + c from z = 0, where c is the pixel. */
export function mandelbrotEscape(
	cx: number,
	cy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = 0;
	let zy = 0;
	let i = 0;
	for (; i < maxIter; i++) {
		const x2 = zx * zx;
		const y2 = zy * zy;
		if (x2 + y2 > r2) break;
		zy = 2 * zx * zy + cy;
		zx = x2 - y2 + cx;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

/** Julia: iterate z := z² + seed from z₀ = (px, py). */
export function juliaEscape(
	px: number,
	py: number,
	seedX: number,
	seedY: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = px;
	let zy = py;
	let i = 0;
	for (; i < maxIter; i++) {
		const x2 = zx * zx;
		const y2 = zy * zy;
		if (x2 + y2 > r2) break;
		zy = 2 * zx * zy + seedY;
		zx = x2 - y2 + seedX;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

/** Burning Ship: z := (|Re z| + i|Im z|)² + c. */
export function burningShipEscape(
	cx: number,
	cy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = 0;
	let zy = 0;
	let i = 0;
	for (; i < maxIter; i++) {
		const ax = Math.abs(zx);
		const ay = Math.abs(zy);
		const x2 = ax * ax;
		const y2 = ay * ay;
		if (x2 + y2 > r2) break;
		zy = 2 * ax * ay + cy;
		zx = x2 - y2 + cx;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

/** Tricorn (Mandelbar): z := conj(z)² + c. */
export function tricornEscape(
	cx: number,
	cy: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = 0;
	let zy = 0;
	let i = 0;
	for (; i < maxIter; i++) {
		const x2 = zx * zx;
		const y2 = zy * zy;
		if (x2 + y2 > r2) break;
		zy = -2 * zx * zy + cy;
		zx = x2 - y2 + cx;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

export const FORMULAS: { id: FormulaId; label: string }[] = [
	{ id: 'mandelbrot', label: 'Mandelbrot' },
	{ id: 'julia', label: 'Julia' },
	{ id: 'burning-ship', label: 'Burning Ship' },
	{ id: 'tricorn', label: 'Tricorn' }
];

/** Stable integer codes passed to the shaders to select the iteration. */
export const FORMULA_CODES: Record<FormulaId, number> = {
	mandelbrot: 0,
	julia: 1,
	'burning-ship': 2,
	tricorn: 3
};

export interface ComplexPoint {
	x: number;
	y: number;
}

/**
 * Map a device pixel to a point in the complex plane. `scale` is the vertical
 * extent of the view in complex units; up is the positive imaginary direction.
 */
export function pixelToComplex(
	px: number,
	py: number,
	width: number,
	height: number,
	centerX: number,
	centerY: number,
	scale: number
): ComplexPoint {
	const perPixel = scale / height;
	return {
		x: centerX + (px - width / 2) * perPixel,
		y: centerY - (py - height / 2) * perPixel
	};
}
