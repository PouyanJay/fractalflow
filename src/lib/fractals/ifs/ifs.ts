/**
 * Iterated Function System reference math for the IFS art style.
 *
 * An IFS is a small set of contractive affine maps, each with a selection
 * probability (weight). The chaos game seeds a point, then repeatedly picks a
 * map at random (weighted) and applies it; the orbit converges to the system's
 * fractal attractor regardless of where it started. Classic attractors — the
 * Barnsley fern, Sierpiński triangle/carpet, Heighway dragon, Koch and Lévy C
 * curves — are all encoded purely as weighted affine maps here.
 *
 * This module is the CPU reference: the WGSL compute chaos game mirrors these
 * exact coefficients and the same weighted selection, and `ifsBounds` frames
 * each system for the renderer. Each map also carries a colour coordinate so
 * the orbit blends a structure-revealing hue, the way fractal flames do.
 */

/** Affine coefficients (a,b,c,d,e,f): x' = a·x+b·y+c, y' = d·x+e·y+f. */
export type Affine = readonly [number, number, number, number, number, number];

export function applyAffine(m: Affine, x: number, y: number): [number, number] {
	return [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]];
}

export interface IFSMap {
	affine: Affine;
	/** Relative selection probability (need not sum to 1; normalised at pick time). */
	weight: number;
	/** Colour coordinate in [0,1] this map pulls the orbit toward. */
	color: number;
}

export interface IFSystem {
	id: string;
	label: string;
	maps: IFSMap[];
}

export interface IFSPoint {
	x: number;
	y: number;
	/** Blended colour coordinate in [0,1], indexes the palette. */
	c: number;
}

const SIN60 = Math.sin(Math.PI / 3); // √3/2
const THIRD = 1 / 3;

/** Spread n colour coordinates evenly across the palette span [0,1]. */
const evenColor = (i: number, n: number): number => (n <= 1 ? 0 : i / (n - 1));

/** Build a uniform-weight system from bare affine maps, colouring by index. */
function uniform(id: string, label: string, affines: Affine[]): IFSystem {
	return {
		id,
		label,
		maps: affines.map((affine, i) => ({ affine, weight: 1, color: evenColor(i, affines.length) }))
	};
}

// Heighway dragon / Lévy C share a ±45° rotation-and-shrink (scale 1/√2 ⇒ ±0.5).
const dragon = uniform('dragon-curve', 'Dragon Curve', [
	[0.5, -0.5, 0, 0.5, 0.5, 0],
	[-0.5, -0.5, 1, 0.5, -0.5, 0]
]);

const levyC = uniform('levy-c', 'Lévy C Curve', [
	[0.5, -0.5, 0, 0.5, 0.5, 0],
	[0.5, 0.5, 0.5, -0.5, 0.5, 0.5]
]);

// Koch curve from (0,0)→(1,0): four 1/3-scale copies, the middle two rotated ±60°.
const koch = uniform('koch-curve', 'Koch Curve', [
	[THIRD, 0, 0, 0, THIRD, 0],
	[THIRD / 2, -SIN60 * THIRD, THIRD, SIN60 * THIRD, THIRD / 2, 0],
	[THIRD / 2, SIN60 * THIRD, 0.5, -SIN60 * THIRD, THIRD / 2, SIN60 * THIRD],
	[THIRD, 0, 2 / 3, 0, THIRD, 0]
]);

const sierpinskiTriangle = uniform('sierpinski-triangle', 'Sierpiński Triangle', [
	[0.5, 0, 0, 0, 0.5, 0],
	[0.5, 0, 0.5, 0, 0.5, 0],
	[0.5, 0, 0.25, 0, 0.5, SIN60 / 2]
]);

// Sierpiński carpet: the eight outer thirds of the unit square (centre removed).
const carpetCells: Affine[] = [];
for (let j = 0; j < 3; j++) {
	for (let i = 0; i < 3; i++) {
		if (i === 1 && j === 1) continue;
		carpetCells.push([THIRD, 0, i * THIRD, 0, THIRD, j * THIRD]);
	}
}
const sierpinskiCarpet = uniform('sierpinski-carpet', 'Sierpiński Carpet', carpetCells);

// Barnsley fern: the canonical four maps with their famous weights. The stem
// (map 0, p≈0.01) is degenerate (collapses to the y-axis); the dominant map
// (p≈0.85) grows the self-similar frond. Colour separates stem/leaflets.
const barnsleyFern: IFSystem = {
	id: 'barnsley-fern',
	label: 'Barnsley Fern',
	maps: [
		{ affine: [0, 0, 0, 0, 0.16, 0], weight: 0.01, color: 0.05 },
		{ affine: [0.85, 0.04, 0, -0.04, 0.85, 1.6], weight: 0.85, color: 0.55 },
		{ affine: [0.2, -0.26, 0, 0.23, 0.22, 1.6], weight: 0.07, color: 0.8 },
		{ affine: [-0.15, 0.28, 0, 0.26, 0.24, 0.44], weight: 0.07, color: 1.0 }
	]
};

export const IFS_SYSTEMS: readonly IFSystem[] = [
	barnsleyFern,
	sierpinskiTriangle,
	dragon,
	koch,
	levyC,
	sierpinskiCarpet
];

export function getIFS(id: string): IFSystem {
	return IFS_SYSTEMS.find((s) => s.id === id) ?? IFS_SYSTEMS[0];
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
 * the plotted orbit (point + blended colour). Maps are picked by weight, so the
 * Barnsley fern's lopsided probabilities reproduce exactly. Deterministic for a
 * given seed.
 */
export function chaosGame(system: IFSystem, steps: number, seed = 1, skip = 20): IFSPoint[] {
	const rng = mulberry32(seed);
	const total = system.maps.reduce((s, m) => s + m.weight, 0);
	const pick = (): IFSMap => {
		let r = rng() * total;
		for (const m of system.maps) {
			r -= m.weight;
			if (r <= 0) return m;
		}
		return system.maps[system.maps.length - 1];
	};

	let x = rng() * 0.2 - 0.1;
	let y = rng() * 0.2 - 0.1;
	let c = rng();
	for (let i = 0; i < skip; i++) {
		const m = pick();
		[x, y] = applyAffine(m.affine, x, y);
		c = (c + m.color) / 2;
	}
	const pts: IFSPoint[] = new Array(steps);
	for (let i = 0; i < steps; i++) {
		const m = pick();
		[x, y] = applyAffine(m.affine, x, y);
		c = (c + m.color) / 2;
		pts[i] = { x, y, c };
	}
	return pts;
}

export interface IFSBounds {
	min: { x: number; y: number };
	max: { x: number; y: number };
}

/** Axis-aligned bounds of a system's attractor, for framing the view. */
export function ifsBounds(system: IFSystem): IFSBounds {
	const pts = chaosGame(system, 8000, 1);
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
