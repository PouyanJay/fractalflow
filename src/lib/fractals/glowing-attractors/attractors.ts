/**
 * Strange-attractor reference math for the Glowing Attractors art style.
 *
 * Each family is a pure step function `p → p'`. The 2D maps (Clifford, de Jong,
 * Hénon, Ikeda) are discrete iterated functions; the 3D flows (Lorenz, Thomas) advance one
 * fixed step of classic RK4 over their vector field. RK4 (not Euler) matters:
 * forward Euler diverges for Lorenz over a long transient, so particles never
 * settle onto the manifold. This module is the CPU reference — the WGSL compute
 * integrator mirrors these exact formulas, and the seeds/framing feed the
 * renderer.
 */

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** One classic Runge-Kutta 4 step of the flow `deriv`. */
function rk4(p: Vec3, dt: number, deriv: (q: Vec3) => Vec3): Vec3 {
	const k1 = deriv(p);
	const k2 = deriv({
		x: p.x + (dt / 2) * k1.x,
		y: p.y + (dt / 2) * k1.y,
		z: p.z + (dt / 2) * k1.z
	});
	const k3 = deriv({
		x: p.x + (dt / 2) * k2.x,
		y: p.y + (dt / 2) * k2.y,
		z: p.z + (dt / 2) * k2.z
	});
	const k4 = deriv({ x: p.x + dt * k3.x, y: p.y + dt * k3.y, z: p.z + dt * k3.z });
	return {
		x: p.x + (dt / 6) * (k1.x + 2 * k2.x + 2 * k3.x + k4.x),
		y: p.y + (dt / 6) * (k1.y + 2 * k2.y + 2 * k3.y + k4.y),
		z: p.z + (dt / 6) * (k1.z + 2 * k2.z + 2 * k3.z + k4.z)
	};
}

export type AttractorId =
	| 'clifford'
	| 'de-jong'
	| 'lorenz'
	| 'thomas'
	| 'aizawa'
	| 'rossler'
	| 'halvorsen'
	| 'chen'
	| 'dadras'
	| 'henon'
	| 'ikeda';

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

const LORENZ_DT = 0.01;
const THOMAS_DT = 0.05;

const lorenzDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const sigma = 10,
		rho = 28,
		beta = 8 / 3;
	return { x: sigma * (y - x), y: x * (rho - z) - y, z: x * y - beta * z };
};

const thomasDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const b = 0.208186;
	return { x: Math.sin(y) - b * x, y: Math.sin(z) - b * y, z: Math.sin(x) - b * z };
};

const aizawaDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const a = 0.95,
		b = 0.7,
		c = 0.6,
		d = 3.5,
		e = 0.25,
		f = 0.1;
	return {
		x: (z - b) * x - d * y,
		y: d * x + (z - b) * y,
		z: c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x
	};
};

const rosslerDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const a = 0.2,
		b = 0.2,
		c = 5.7;
	return { x: -y - z, y: x + a * y, z: b + z * (x - c) };
};

const halvorsenDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const a = 1.4;
	return {
		x: -a * x - 4 * y - 4 * z - y * y,
		y: -a * y - 4 * z - 4 * x - z * z,
		z: -a * z - 4 * x - 4 * y - x * x
	};
};

const chenDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const a = 35,
		b = 3,
		c = 28;
	return { x: a * (y - x), y: (c - a) * x - x * z + c * y, z: x * y - b * z };
};

const dadrasDeriv = ({ x, y, z }: Vec3): Vec3 => {
	const a = 3,
		b = 2.7,
		c = 1.7,
		d = 2,
		e = 9;
	return { x: y - a * x + b * y * z, y: c * y - x * z + z, z: d * x * y - e * z };
};

/** Integration step per flow — small enough that RK4 stays stable for each. */
export const FLOW_DT: Partial<Record<AttractorId, number>> = {
	lorenz: 0.01,
	thomas: 0.05,
	aizawa: 0.01,
	rossler: 0.03,
	halvorsen: 0.01,
	chen: 0.005,
	dadras: 0.01
};

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
		step(p) {
			return rk4(p, LORENZ_DT, lorenzDeriv);
		}
	},
	{
		id: 'thomas',
		label: 'Thomas',
		dims: 3,
		seed: { x: 0.1, y: 0, z: 0 },
		step(p) {
			return rk4(p, THOMAS_DT, thomasDeriv);
		}
	},
	{
		id: 'aizawa',
		label: 'Aizawa',
		dims: 3,
		seed: { x: 0.1, y: 0, z: 0 },
		step(p) {
			return rk4(p, FLOW_DT.aizawa!, aizawaDeriv);
		}
	},
	{
		id: 'rossler',
		label: 'Rössler',
		dims: 3,
		seed: { x: 0.1, y: 0, z: 0 },
		step(p) {
			return rk4(p, FLOW_DT.rossler!, rosslerDeriv);
		}
	},
	{
		id: 'halvorsen',
		label: 'Halvorsen',
		dims: 3,
		seed: { x: -5, y: 0, z: 0 },
		step(p) {
			return rk4(p, FLOW_DT.halvorsen!, halvorsenDeriv);
		}
	},
	{
		id: 'chen',
		label: 'Chen',
		dims: 3,
		seed: { x: -0.1, y: 0.5, z: -0.6 },
		step(p) {
			return rk4(p, FLOW_DT.chen!, chenDeriv);
		}
	},
	{
		id: 'dadras',
		label: 'Dadras',
		dims: 3,
		seed: { x: 1.1, y: 2.1, z: -2 },
		step(p) {
			return rk4(p, FLOW_DT.dadras!, dadrasDeriv);
		}
	},
	{
		// Hénon map: the canonical (a, b) = (1.4, 0.3) — a folded, banded attractor.
		id: 'henon',
		label: 'Hénon',
		dims: 2,
		seed: { x: 0, y: 0, z: 0 },
		step({ x, y }) {
			const a = 1.4,
				b = 0.3;
			return { x: 1 - a * x * x + y, y: b * x, z: 0 };
		}
	},
	{
		// Ikeda map: u = 0.918, with the orbit-angle t = 0.4 − 6/(1 + x² + y²).
		id: 'ikeda',
		label: 'Ikeda',
		dims: 2,
		seed: { x: 0.1, y: 0.1, z: 0 },
		step({ x, y }) {
			const u = 0.918;
			const t = 0.4 - 6 / (1 + x * x + y * y);
			const ct = Math.cos(t),
				st = Math.sin(t);
			return { x: 1 + u * (x * ct - y * st), y: u * (x * st + y * ct), z: 0 };
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
