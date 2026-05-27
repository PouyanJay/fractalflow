/**
 * Coloring algorithms for the Deep-Zoom 2D escape-time renderer. Beyond the
 * default smooth-iteration count, a scene can colour by an orbit trap, a
 * boundary distance estimate, the final iterate's complex phase (domain
 * colouring), or by how deep a non-escaping interior orbit fell. A single
 * `coloring` enum on the scene selects the mode; the shaders mirror these pure
 * helpers exactly (same trap shape, HSV form, and distance-estimate formula).
 *
 * The quantities each mode needs — min orbit-trap distance, the running
 * derivative |dz/dc|, and min |z| — are accumulated during the existing
 * iteration in renderer.ts (on both the direct and perturbation paths, which
 * each reconstruct the full z), then handed to a shared `shade()` in the shader.
 */

import type { ColoringId } from '$lib/engine/types';
export type { ColoringId };

export const COLORINGS: { id: ColoringId; label: string }[] = [
	{ id: 'smooth', label: 'Smooth' },
	{ id: 'orbit-trap', label: 'Orbit Trap' },
	{ id: 'distance', label: 'Distance' },
	{ id: 'domain', label: 'Domain' },
	{ id: 'interior', label: 'Interior' }
];

/** Stable integer codes passed to the shaders (packed into series1.w). */
export const COLORING_CODES: Record<ColoringId, number> = {
	smooth: 0,
	'orbit-trap': 1,
	distance: 2,
	domain: 3,
	interior: 4
};

export const DEFAULT_COLORING: ColoringId = 'smooth';

/** Pickover-stalk orbit trap: distance to the nearer of the two axes. */
export function orbitTrapDistance(zx: number, zy: number): number {
	return Math.min(Math.abs(zx), Math.abs(zy));
}

/** HSV→RGB (h wrapped to [0,1), s and v in [0,1]); the shader mirrors this. */
export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
	const hue = h - Math.floor(h); // wrap
	const i = Math.floor(hue * 6);
	const f = hue * 6 - i;
	const p = v * (1 - s);
	const q = v * (1 - f * s);
	const t = v * (1 - (1 - f) * s);
	switch (i % 6) {
		case 0:
			return [v, t, p];
		case 1:
			return [q, v, p];
		case 2:
			return [p, v, t];
		case 3:
			return [p, q, v];
		case 4:
			return [t, p, v];
		default:
			return [v, p, q];
	}
}

/** Domain colouring of a complex value: hue = phase, value = log-banded |z|. */
export function domainColor(zx: number, zy: number): [number, number, number] {
	const h = Math.atan2(zy, zx) / (2 * Math.PI) + 0.5; // [0,1)
	const mag = Math.hypot(zx, zy);
	// Log-banded brightness: a ring at each octave of |z| reads the flow.
	const band = mag > 0 ? Math.log2(mag) : 0;
	const v = 0.55 + 0.45 * (band - Math.floor(band));
	return hsv2rgb(h, 0.75, Math.min(1, v));
}

/**
 * Boundary distance estimate from the final iterate and the running derivative:
 * de ≈ |z|·ln|z| / |dz/dc|. Small near the set boundary (thin filaments),
 * larger out in the open. Guarded against a zero derivative.
 *
 * The derivative recurrence (D ← 2zD + 1) is exact only for the holomorphic
 * z²+c maps (Mandelbrot/Julia). For the abs-variant / Multibrot families it is
 * an *approximate* aesthetic estimator, not a true boundary distance.
 */
export function distanceEstimate(zMag: number, derivMag: number): number {
	if (derivMag <= 0) return 0;
	return (zMag * Math.log(Math.max(zMag, 1.0000001))) / derivMag;
}

export interface ColorData {
	escaped: boolean;
	/** Escape iteration (integer); maxIter when interior. */
	iter: number;
	zx: number;
	zy: number;
	/** Min orbit-trap distance over the orbit. */
	trap: number;
	/** |dz/dc| at the final iterate (for distance estimation). */
	derivMag: number;
	/** Min |z| reached over the orbit (interior structure). */
	minZ: number;
}

/**
 * Mandelbrot iteration tracking every quantity the coloring modes need — the
 * oracle the shader's accumulators are checked against. Derivative recurrence
 * D ← 2·z·D + 1 (D₀ = 0), z ← z² + c.
 */
export function mandelbrotColorData(
	cx: number,
	cy: number,
	maxIter: number,
	bailout = 256
): ColorData {
	const r2 = bailout * bailout;
	let zx = 0;
	let zy = 0;
	let dx = 0;
	let dy = 0;
	let trap = Infinity;
	let minZ = Infinity;
	let i = 0;
	for (; i < maxIter; i++) {
		const x2 = zx * zx;
		const y2 = zy * zy;
		const mag2 = x2 + y2;
		if (mag2 > r2) break;
		// Skip the trivial seed z₀ = 0 (it sits on the cross and at the origin, so
		// it would pin trap and minZ to 0 for every pixel); trap the orbit from z₁.
		if (i > 0) {
			const t = orbitTrapDistance(zx, zy);
			if (t < trap) trap = t;
			const m = Math.sqrt(mag2);
			if (m < minZ) minZ = m;
		}
		// D ← 2·z·D + 1
		const ndx = 2 * (zx * dx - zy * dy) + 1;
		const ndy = 2 * (zx * dy + zy * dx);
		dx = ndx;
		dy = ndy;
		// z ← z² + c
		zy = 2 * zx * zy + cy;
		zx = x2 - y2 + cx;
	}
	return {
		escaped: i < maxIter,
		iter: i,
		zx,
		zy,
		trap: Number.isFinite(trap) ? trap : 0,
		derivMag: Math.hypot(dx, dy),
		minZ: Number.isFinite(minZ) ? minZ : 0
	};
}
