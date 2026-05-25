/**
 * CPU reference implementation for the Deep-Zoom 2D (Mandelbrot) renderer.
 *
 * This is the oracle the GPU shader is checked against and the source of truth
 * for the math. f64 here (deep zoom via perturbation is a later phase); the
 * shaders mirror this in f32.
 */

export interface EscapeResult {
	escaped: boolean;
	/** Integer iteration at escape (or maxIter when inside). */
	iter: number;
	/** Continuous (smooth) iteration count for banding-free coloring. */
	smooth: number;
}

/**
 * Iterate z := z² + c from z = 0. Uses a large bailout radius (256) so the
 * smooth-coloring logarithm is well-behaved.
 */
export function mandelbrotEscape(
	cx: number,
	cy: number,
	maxIter: number,
	bailoutRadius = 256
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
	// Smooth iteration count: nu = log2(log|z| / log2)
	const logZn = Math.log(zx * zx + zy * zy) / 2;
	const nu = Math.log(logZn / Math.LN2) / Math.LN2;
	return { escaped: true, iter: i, smooth: i + 1 - nu };
}

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
