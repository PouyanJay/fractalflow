/**
 * Fractal-flame reference math (Scott Draves flam3 style) for the Painterly
 * Flames art style. A flame is a weighted Iterated Function System: each
 * transform is an affine map followed by a nonlinear "variation", plus a colour
 * coordinate. The chaos game picks transforms at random and plots the orbit,
 * blending the colour each step; the renderer accumulates density and colour
 * per pixel and tone-maps with log-density.
 *
 * This module is the CPU reference — the WGSL chaos game mirrors these exact
 * variations and the baked flame transforms, and `flameBounds` frames each
 * flame for the renderer. Variations here are bounded or radius-preserving so
 * the orbit can't run away (no raw `spherical`/1-r² blow-ups).
 */

export interface FlamePoint {
	x: number;
	y: number;
	/** Colour coordinate in [0,1], indexes the palette. */
	c: number;
}

/** Affine coefficients (a,b,c,d,e,f): x' = a·x+b·y+c, y' = d·x+e·y+f. */
export type Affine = readonly [number, number, number, number, number, number];

export function applyAffine(a: Affine, x: number, y: number): [number, number] {
	return [a[0] * x + a[1] * y + a[2], a[3] * x + a[4] * y + a[5]];
}

/** Nonlinear variations, keyed by name; each is mirrored exactly in the WGSL. */
export const VARIATIONS = {
	linear: (x: number, y: number): [number, number] => [x, y],
	sinusoidal: (x: number, y: number): [number, number] => [Math.sin(x), Math.sin(y)],
	spherical: (x: number, y: number): [number, number] => {
		const r2 = x * x + y * y || 1e-12;
		return [x / r2, y / r2];
	},
	swirl: (x: number, y: number): [number, number] => {
		const r2 = x * x + y * y;
		const s = Math.sin(r2);
		const co = Math.cos(r2);
		return [x * s - y * co, x * co + y * s];
	},
	horseshoe: (x: number, y: number): [number, number] => {
		const r = Math.hypot(x, y);
		const inv = r > 1e-12 ? 1 / r : 0;
		return [inv * (x - y) * (x + y), inv * 2 * x * y];
	}
} as const;

export type VariationId = keyof typeof VARIATIONS;

export interface Transform {
	affine: Affine;
	variation: VariationId;
	/** Colour coordinate this transform pulls the orbit toward. */
	color: number;
	/** Relative selection probability. */
	weight: number;
}

export function applyTransform(t: Transform, x: number, y: number): [number, number] {
	const [ax, ay] = applyAffine(t.affine, x, y);
	return VARIATIONS[t.variation](ax, ay);
}

export interface Flame {
	id: string;
	label: string;
	transforms: Transform[];
}

// Rotation+scale affine helper for legibility.
const rot = (scale: number, deg: number, tx: number, ty: number): Affine => {
	const r = (deg * Math.PI) / 180;
	return [
		scale * Math.cos(r),
		-scale * Math.sin(r),
		tx,
		scale * Math.sin(r),
		scale * Math.cos(r),
		ty
	];
};

export const FLAMES: readonly Flame[] = [
	{
		id: 'sierpinski',
		label: 'Sierpinski',
		transforms: [
			{ affine: [0.5, 0, 0, 0, 0.5, 0], variation: 'linear', color: 0.0, weight: 1 },
			{ affine: [0.5, 0, 0.5, 0, 0.5, 0], variation: 'linear', color: 0.5, weight: 1 },
			{ affine: [0.5, 0, 0, 0, 0.5, 0.5], variation: 'linear', color: 1.0, weight: 1 }
		]
	},
	{
		id: 'sinusoidal',
		label: 'Sinusoidal Web',
		transforms: [
			{ affine: rot(1.6, 12, 0.0, 0.0), variation: 'sinusoidal', color: 0.1, weight: 1 },
			{ affine: rot(1.6, 132, 0.4, 0.0), variation: 'sinusoidal', color: 0.55, weight: 1 },
			{ affine: rot(1.6, 252, -0.3, 0.3), variation: 'sinusoidal', color: 0.95, weight: 1 }
		]
	},
	{
		id: 'swirl',
		label: 'Swirl Bloom',
		transforms: [
			{ affine: rot(0.92, 30, 0.1, 0.0), variation: 'swirl', color: 0.15, weight: 1.3 },
			{ affine: rot(0.78, -95, -0.2, 0.25), variation: 'swirl', color: 0.8, weight: 1 }
		]
	},
	{
		id: 'horseshoe',
		label: 'Horseshoe',
		transforms: [
			{ affine: rot(0.9, 40, 0.0, 0.0), variation: 'horseshoe', color: 0.2, weight: 1 },
			{ affine: rot(0.7, 160, 0.6, 0.1), variation: 'horseshoe', color: 0.65, weight: 1 },
			{ affine: rot(0.6, -70, -0.4, 0.5), variation: 'sinusoidal', color: 1.0, weight: 0.8 }
		]
	}
];

export function getFlame(id: string): Flame {
	return FLAMES.find((f) => f.id === id) ?? FLAMES[0];
}

/** Small deterministic PRNG (mulberry32) so the chaos game is reproducible. */
function mulberry32(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Run the chaos game from a random start, discarding a transient, and return
 * the plotted orbit (point + blended colour). Deterministic for a given seed.
 */
export function chaosGame(flame: Flame, steps: number, seed = 1, skip = 20): FlamePoint[] {
	const rng = mulberry32(seed);
	const total = flame.transforms.reduce((s, t) => s + t.weight, 0);
	const pick = (): Transform => {
		let r = rng() * total;
		for (const t of flame.transforms) {
			r -= t.weight;
			if (r <= 0) return t;
		}
		return flame.transforms[flame.transforms.length - 1];
	};

	let x = rng() * 2 - 1;
	let y = rng() * 2 - 1;
	let c = rng();
	for (let i = 0; i < skip; i++) {
		const t = pick();
		[x, y] = applyTransform(t, x, y);
		c = (c + t.color) / 2;
	}
	const pts: FlamePoint[] = new Array(steps);
	for (let i = 0; i < steps; i++) {
		const t = pick();
		[x, y] = applyTransform(t, x, y);
		c = (c + t.color) / 2;
		pts[i] = { x, y, c };
	}
	return pts;
}

export interface FlameBounds {
	min: { x: number; y: number };
	max: { x: number; y: number };
}

/** Axis-aligned bounds of a flame's attractor, for framing the view. */
export function flameBounds(flame: Flame): FlameBounds {
	const pts = chaosGame(flame, 4000, 1);
	const min = { x: Infinity, y: Infinity };
	const max = { x: -Infinity, y: -Infinity };
	for (const p of pts) {
		if (p.x < min.x) min.x = p.x;
		if (p.y < min.y) min.y = p.y;
		if (p.x > max.x) max.x = p.x;
		if (p.y > max.y) max.y = p.y;
	}
	return { min, max };
}
