/**
 * Strange-attractor reference math for the Glowing Attractors art style.
 *
 * Each family is a pure step function `p → p'`. The 2D maps (Clifford, de Jong)
 * are discrete iterated functions; the 3D flows (Lorenz, Thomas) advance one
 * fixed-step Euler integration of their vector field. This module is the CPU
 * reference: the WGSL compute integrator mirrors these exact formulas, and the
 * default seeds/framing below feed the renderer. Euler (not RK4) is deliberate
 * — it is trivially reproducible point-for-point and, at the small steps used
 * here, traces each attractor's form faithfully for accumulation art.
 */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

export type AttractorId = 'clifford' | 'de-jong' | 'lorenz' | 'thomas';

export interface Attractor {
	id: AttractorId;
	label: string;
	/** 2 = planar map (z stays 0); 3 = spatial flow. Drives default framing. */
	dims: 2 | 3;
	/** A point on (or quickly attracted to) the attractor. */
	seed: Vec3;
	/** Advance one iteration / integration step. Pure. */
	step(p: Vec3): Vec3;
}

// Lorenz integration step. Small enough that forward Euler tracks the flow.
const LORENZ_DT = 0.01;
// Thomas is a slow, smooth flow; a larger step still traces it cleanly.
const THOMAS_DT = 0.05;

export const ATTRACTORS: readonly Attractor[] = [
	{
		id: 'clifford',
		label: 'Clifford',
		dims: 2,
		seed: { x: 0.1, y: 0.1, z: 0 },
		step({ x, y }) {
			const a = -1.4,
				b = 1.6,
				c = 1.0,
				d = 0.7;
			return {
				x: Math.sin(a * y) + c * Math.cos(a * x),
				y: Math.sin(b * x) + d * Math.cos(b * y),
				z: 0
			};
		}
	},
	{
		id: 'de-jong',
		label: 'de Jong',
		dims: 2,
		seed: { x: 0.1, y: 0.1, z: 0 },
		step({ x, y }) {
			const a = 1.4,
				b = -2.3,
				c = 2.4,
				d = -2.1;
			return {
				x: Math.sin(a * y) - Math.cos(b * x),
				y: Math.sin(c * x) - Math.cos(d * y),
				z: 0
			};
		}
	},
	{
		id: 'lorenz',
		label: 'Lorenz',
		dims: 3,
		seed: { x: 0.1, y: 0, z: 0 },
		step({ x, y, z }) {
			const sigma = 10,
				rho = 28,
				beta = 8 / 3;
			return {
				x: x + LORENZ_DT * (sigma * (y - x)),
				y: y + LORENZ_DT * (x * (rho - z) - y),
				z: z + LORENZ_DT * (x * y - beta * z)
			};
		}
	},
	{
		id: 'thomas',
		label: 'Thomas',
		dims: 3,
		seed: { x: 0.1, y: 0, z: 0 },
		step({ x, y, z }) {
			const b = 0.208186;
			return {
				x: x + THOMAS_DT * (Math.sin(y) - b * x),
				y: y + THOMAS_DT * (Math.sin(z) - b * y),
				z: z + THOMAS_DT * (Math.sin(x) - b * z)
			};
		}
	}
];

export function getAttractor(id: string): Attractor {
	return ATTRACTORS.find((a) => a.id === id) ?? ATTRACTORS[0];
}

/**
 * Iterate from the family seed, discarding an initial transient so the returned
 * points lie on the attractor. Deterministic for a given (attractor, steps).
 */
export function orbit(a: Attractor, steps: number, skip = 200): Vec3[] {
	let p = a.seed;
	for (let i = 0; i < skip; i++) p = a.step(p);
	const pts: Vec3[] = new Array(steps);
	for (let i = 0; i < steps; i++) {
		p = a.step(p);
		pts[i] = p;
	}
	return pts;
}

export interface Bounds {
	min: Vec3;
	max: Vec3;
}

/** Component-wise axis-aligned bounds of a point cloud. */
export function boundsOf(points: readonly Vec3[]): Bounds {
	const min: Vec3 = { x: Infinity, y: Infinity, z: Infinity };
	const max: Vec3 = { x: -Infinity, y: -Infinity, z: -Infinity };
	for (const p of points) {
		if (p.x < min.x) min.x = p.x;
		if (p.y < min.y) min.y = p.y;
		if (p.z < min.z) min.z = p.z;
		if (p.x > max.x) max.x = p.x;
		if (p.y > max.y) max.y = p.y;
		if (p.z > max.z) max.z = p.z;
	}
	return { min, max };
}
