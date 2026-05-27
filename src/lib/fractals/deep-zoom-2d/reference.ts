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

/**
 * The "abs-variant" Mandelbrot family — each folds the orbit with an absolute
 * value in a different place, so the smooth z²+c symmetry breaks into a distinct
 * silhouette. All iterate z from 0 with c = the pixel, like the Mandelbrot.
 * They share the smooth/bailout machinery; only the per-step map differs:
 *   - Celtic:                zₓ ← |x²−y²| + cₓ,  z_y ← 2xy + c_y
 *   - Buffalo:               zₓ ← |x²−y²| + cₓ,  z_y ← 2|xy| + c_y
 *   - Perpendicular:         zₓ ← x²−y² + cₓ,    z_y ← 2|x|y + c_y
 *   - Perpendicular Ship:    zₓ ← x²−y² + cₓ,    z_y ← 2x|y| + c_y
 *   - Celtic Mandelbar:      zₓ ← |x²−y²| + cₓ,  z_y ← −2xy + c_y
 */
type AbsVariant =
	| 'celtic'
	| 'buffalo'
	| 'perpendicular'
	| 'perpendicular-ship'
	| 'celtic-mandelbar';

function absVariantEscape(
	variant: AbsVariant,
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
		let ny: number;
		let nx: number;
		switch (variant) {
			case 'celtic':
				ny = 2 * zx * zy + cy;
				nx = Math.abs(x2 - y2) + cx;
				break;
			case 'buffalo':
				ny = 2 * Math.abs(zx * zy) + cy;
				nx = Math.abs(x2 - y2) + cx;
				break;
			case 'perpendicular':
				ny = 2 * Math.abs(zx) * zy + cy;
				nx = x2 - y2 + cx;
				break;
			case 'perpendicular-ship':
				ny = 2 * zx * Math.abs(zy) + cy;
				nx = x2 - y2 + cx;
				break;
			case 'celtic-mandelbar':
				ny = -2 * zx * zy + cy;
				nx = Math.abs(x2 - y2) + cx;
				break;
		}
		zy = ny;
		zx = nx;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

/** Celtic Mandelbrot: zₓ ← |x²−y²| + cₓ. */
export const celticEscape = (cx: number, cy: number, maxIter: number, b = DEFAULT_BAILOUT_RADIUS) =>
	absVariantEscape('celtic', cx, cy, maxIter, b);
/** Buffalo: |x²−y²| real fold plus a Burning-Ship-style |xy| cross term. */
export const buffaloEscape = (
	cx: number,
	cy: number,
	maxIter: number,
	b = DEFAULT_BAILOUT_RADIUS
) => absVariantEscape('buffalo', cx, cy, maxIter, b);
/** Perpendicular Mandelbrot: abs on the real part inside the cross term. */
export const perpendicularEscape = (
	cx: number,
	cy: number,
	maxIter: number,
	b = DEFAULT_BAILOUT_RADIUS
) => absVariantEscape('perpendicular', cx, cy, maxIter, b);
/** Perpendicular Burning Ship: abs on the imaginary part inside the cross term. */
export const perpendicularShipEscape = (
	cx: number,
	cy: number,
	maxIter: number,
	b = DEFAULT_BAILOUT_RADIUS
) => absVariantEscape('perpendicular-ship', cx, cy, maxIter, b);
/** Celtic Mandelbar: the Celtic real fold with the Tricorn's conjugated cross term. */
export const celticMandelbarEscape = (
	cx: number,
	cy: number,
	maxIter: number,
	b = DEFAULT_BAILOUT_RADIUS
) => absVariantEscape('celtic-mandelbar', cx, cy, maxIter, b);

/**
 * Multibrot: z := zᵈ + c from z = 0, with a real exponent d. Uses the polar
 * form zᵈ = rᵈ·(cos dθ + i·sin dθ), so non-integer powers work too (d = 2 is the
 * Mandelbrot). The default power lives in DEFAULT_POWER.
 */
export const DEFAULT_POWER = 2;

export function multibrotEscape(
	cx: number,
	cy: number,
	power: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = 0;
	let zy = 0;
	let i = 0;
	for (; i < maxIter; i++) {
		const mag2 = zx * zx + zy * zy;
		if (mag2 > r2) break;
		const r = Math.pow(mag2, power / 2); // (√mag2)^power, one pow call
		const theta = Math.atan2(zy, zx) * power;
		zx = r * Math.cos(theta) + cx;
		zy = r * Math.sin(theta) + cy;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

/** The three cube roots of unity — the attractors of Newton's method on z³−1. */
export const NEWTON_ROOTS: ReadonlyArray<[number, number]> = [
	[1, 0],
	[-0.5, Math.sqrt(3) / 2],
	[-0.5, -Math.sqrt(3) / 2]
];

export interface NewtonResult {
	/** Index into NEWTON_ROOTS of the basin the orbit fell into (−1 = none yet). */
	root: number;
	/** Iterations taken to converge (maxIter if it never did). */
	iter: number;
}

/**
 * Newton fractal for z³ − 1: from z₀ = the pixel, iterate Newton's method
 * z ← z − (z³−1)/(3z²) and record which root it converges to and how fast. Not
 * escape-time — every point (bar a measure-zero set) converges; the fractal is
 * the basin boundary. Colored by basin + convergence speed.
 */
export function newtonRoot(px: number, py: number, maxIter: number, tol = 1e-3): NewtonResult {
	const tol2 = tol * tol;
	let zx = px;
	let zy = py;
	for (let i = 0; i < maxIter; i++) {
		// f = z³ − 1, f' = 3z².
		const x2 = zx * zx - zy * zy;
		const y2 = 2 * zx * zy; // z²
		const fx = x2 * zx - y2 * zy - 1; // Re(z³) − 1
		const fy = x2 * zy + y2 * zx; // Im(z³)
		const px2 = 3 * x2;
		const py2 = 3 * y2; // 3z²
		const d = px2 * px2 + py2 * py2 + 1e-12;
		// q = f / f' = f · conj(f') / |f'|².
		const qx = (fx * px2 + fy * py2) / d;
		const qy = (fy * px2 - fx * py2) / d;
		zx -= qx;
		zy -= qy;
		for (let r = 0; r < NEWTON_ROOTS.length; r++) {
			const dx = zx - NEWTON_ROOTS[r][0];
			const dy = zy - NEWTON_ROOTS[r][1];
			if (dx * dx + dy * dy < tol2) return { root: r, iter: i };
		}
	}
	return { root: -1, iter: maxIter };
}

/**
 * Phoenix set: z_{n+1} = z_n² + c + p·z_{n−1}, from z₀ = the pixel (Julia-style)
 * and z_{−1} = 0, with real constant c and real coupling p. Reuses the Julia
 * seed: seedX = c, seedY = p (so p = 0 collapses to a real-seed Julia).
 */
export function phoenixEscape(
	px: number,
	py: number,
	c: number,
	p: number,
	maxIter: number,
	bailoutRadius = DEFAULT_BAILOUT_RADIUS
): EscapeResult {
	const r2 = bailoutRadius * bailoutRadius;
	let zx = px;
	let zy = py;
	let zpx = 0;
	let zpy = 0;
	let i = 0;
	for (; i < maxIter; i++) {
		const x2 = zx * zx;
		const y2 = zy * zy;
		if (x2 + y2 > r2) break;
		const nx = x2 - y2 + c + p * zpx;
		const ny = 2 * zx * zy + p * zpy;
		zpx = zx;
		zpy = zy;
		zx = nx;
		zy = ny;
	}
	if (i >= maxIter) return { escaped: false, iter: maxIter, smooth: maxIter };
	return { escaped: true, iter: i, smooth: smoothCount(i, zx, zy) };
}

export const FORMULAS: { id: FormulaId; label: string }[] = [
	{ id: 'mandelbrot', label: 'Mandelbrot' },
	{ id: 'julia', label: 'Julia' },
	{ id: 'burning-ship', label: 'Burning Ship' },
	{ id: 'tricorn', label: 'Tricorn' },
	{ id: 'celtic', label: 'Celtic' },
	{ id: 'buffalo', label: 'Buffalo' },
	{ id: 'perpendicular', label: 'Perpendicular' },
	{ id: 'perpendicular-ship', label: 'Perpendicular Ship' },
	{ id: 'celtic-mandelbar', label: 'Celtic Mandelbar' },
	{ id: 'multibrot', label: 'Multibrot' },
	{ id: 'newton', label: 'Newton' },
	{ id: 'phoenix', label: 'Phoenix' }
];

/** Stable integer codes passed to the shaders to select the iteration. */
export const FORMULA_CODES: Record<FormulaId, number> = {
	mandelbrot: 0,
	julia: 1,
	'burning-ship': 2,
	tricorn: 3,
	celtic: 4,
	buffalo: 5,
	perpendicular: 6,
	'perpendicular-ship': 7,
	'celtic-mandelbar': 8,
	multibrot: 9,
	newton: 10,
	phoenix: 11
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
