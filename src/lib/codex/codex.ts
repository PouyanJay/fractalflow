/**
 * The Codex: turns the current scene into human-readable narration for Explore's
 * right panel — what you're looking at, and (for the Mandelbrot) which famous
 * landmark you're near. Pure and framework-free so it's trivially testable.
 */
import type { ArtStyleId } from '$lib/stores/ui-logic';
import type { FormulaId, SceneState } from '$lib/engine/types';

export interface SceneDescription {
	title: string;
	body: string;
	/** The defining iteration / construction (shown in Compose's guide). */
	math?: string;
	/** Where this fractal shows up beyond art. */
	applications?: string;
	/** Practical advice for authoring a good-looking result here. */
	tips?: string;
}

const FORMULA_TEXT: Record<FormulaId, SceneDescription> = {
	mandelbrot: {
		title: 'Mandelbrot',
		body: 'The Mandelbrot set — iterate z → z² + c and keep the c that never escape. Its boundary is endlessly intricate, the same motifs recurring at every scale.',
		math: 'Start z₀ = 0 and iterate zₙ₊₁ = zₙ² + c, where c is the pixel’s complex coordinate. If the orbit stays bounded (|z| ≤ 2 forever) the point is in the set; otherwise it is shaded by how fast it escapes.',
		applications: 'The emblem of complex dynamics and chaos theory — used to teach iteration and self-similarity, and as a workhorse for generative art and procedural texturing.',
		tips: 'Keep iterations low for a soft, poster-like boundary; raise them to resolve the filigree as you zoom deeper. Try a Kaleidoscope warp for symmetry, or a little Bloom to make bright bands glow.'
	},
	julia: {
		title: 'Julia set',
		body: 'A Julia set — fix c and vary the starting z. It is connected exactly when that c lies inside the Mandelbrot set; the seed shapes the whole filigree.',
		math: 'Fix a constant c and iterate zₙ₊₁ = zₙ² + c from each pixel’s z₀. The filled Julia set is the z₀ whose orbits stay bounded; the set is connected iff c lies in the Mandelbrot set.',
		applications: 'A classic demonstration of sensitive dependence on a parameter: sweeping the seed c morphs the shape continuously, which makes it a natural design control.',
		tips: 'Edit the Julia seed (Re / Im) in the Source node. Seeds just inside the Mandelbrot boundary give the richest, most lace-like sets; seeds outside it shatter into dust.'
	},
	'burning-ship': {
		title: 'Burning Ship',
		body: 'The Burning Ship — fold z by its absolute value each step. The result reads like fractal hulls ablaze on a dark sea.',
		math: 'Iterate zₙ₊₁ = (|Re zₙ| + i·|Im zₙ|)² + c. Taking absolute values each step makes the map non-analytic, breaking the Mandelbrot’s smooth symmetry into angular, ship-like hulls.',
		applications: 'A well-known “modified Mandelbrot” used to study how small changes to an iteration formula reshape its dynamics.',
		tips: 'Pan along the real axis below the main body to find the namesake ships, then raise iterations to sharpen their rigging.'
	},
	tricorn: {
		title: 'Tricorn',
		body: 'The Tricorn (Mandelbar) — conjugate z each iteration. Its three-fold symmetry gives the boundary a faceted, anti-holomorphic character.',
		math: 'Iterate zₙ₊₁ = z̄ₙ² + c, conjugating z each step. The map is anti-holomorphic, which produces the characteristic three-fold symmetry.',
		applications: 'Studied as the “Mandelbar” — a standard example of an anti-holomorphic dynamical system and its period-doubling behaviour.',
		tips: 'Zoom the cusps where the three lobes meet for the most faceted detail; higher iterations crisp up the edges.'
	}
};

const STYLE_TEXT: Record<Exclude<ArtStyleId, 'deep-zoom-2d'>, SceneDescription> = {
	'geometric-3d': {
		title: 'Mandelbulb',
		body: 'A raymarched Mandelbulb — an escape-time fractal lifted into 3D and lit like a sculpture. Orbit and dolly to read its surface.',
		math: 'A 3D analogue of the Mandelbrot using a spherical-coordinate power map zₙ₊₁ = zₙⁿ + c (typically n = 8). It is rendered by raymarching a distance estimator rather than per-pixel iteration.',
		applications: 'A showcase for distance-field / signed-distance rendering — the same technique behind much procedural shader art and demoscene work.',
		tips: 'Orbit and dolly in Explore to catch the light. Raise Detail to deepen the surface; add Bloom for a soft sculptural glow.'
	},
	attractors: {
		title: 'Glowing Attractor',
		body: 'A strange attractor — a single chaotic orbit traced for millions of steps, its visited points accumulated into a luminous cloud.',
		math: 'Iterate a chaotic map (Clifford, de Jong) or integrate an ODE flow (Lorenz, Thomas) for millions of steps, accumulate how often each pixel is visited, then tone-map that density logarithmically.',
		applications: 'Strange attractors are the geometry of deterministic chaos — models for weather, turbulence, electronic oscillators and population dynamics.',
		tips: 'Raise Exposure to coax out faint filaments without blowing the core; Bloom makes the dense centre glow like long-exposure light.'
	},
	flames: {
		title: 'Painterly Flame',
		body: 'A fractal flame — the chaos game over a set of affine + variation transforms, with colour accumulated along the orbit.',
		math: 'Run the chaos game over a weighted set of affine maps, each composed with nonlinear “variation” functions, accumulating a colour channel along the orbit (Scott Draves’ fractal-flame algorithm).',
		applications: 'The algorithm behind Electric Sheep and a staple of generative art; also a vivid demonstration of iterated function systems (IFS).',
		tips: 'Pick a flame in the Source node, then pair a warm palette with a touch of Bloom for a painterly, lit-from-within look.'
	}
};

const GENERIC: SceneDescription = {
	title: 'Fractal',
	body: 'Pick an art style in the Start palette to explore a fractal here.'
};

/** A one-line title + paragraph describing the active scene. */
export function describeScene(style: ArtStyleId | null, scene: SceneState): SceneDescription {
	if (style === 'deep-zoom-2d') return FORMULA_TEXT[scene.formula];
	if (style && style in STYLE_TEXT) return STYLE_TEXT[style as keyof typeof STYLE_TEXT];
	return GENERIC;
}

export interface Landmark {
	id: string;
	label: string;
	center: { x: number; y: number };
	/** You're "in" the landmark when the view centre is within this radius of it. */
	radius: number;
}

/** Famous Mandelbrot regions, with a capture radius around each centre. */
export const LANDMARKS: readonly Landmark[] = [
	{
		id: 'seahorse-valley',
		label: 'Seahorse Valley',
		center: { x: -0.745, y: 0.113 },
		radius: 0.06
	},
	{ id: 'elephant-valley', label: 'Elephant Valley', center: { x: 0.275, y: 0.006 }, radius: 0.06 },
	{
		id: 'triple-spiral',
		label: 'Triple Spiral Valley',
		center: { x: -0.0885, y: 0.6565 },
		radius: 0.03
	},
	{ id: 'scepter-valley', label: 'Scepter Valley', center: { x: -1.3618, y: 0 }, radius: 0.025 },
	{ id: 'mini-mandelbrot', label: 'Mini Mandelbrot', center: { x: -1.7497, y: 0 }, radius: 0.02 }
] as const;

/**
 * The named Mandelbrot region the view centre currently sits inside, or null.
 * Only meaningful for the Deep-Zoom Mandelbrot — other formulas/styles have no
 * landmark table.
 */
export function nearestLandmark(style: ArtStyleId | null, scene: SceneState): Landmark | null {
	if (style !== 'deep-zoom-2d' || scene.formula !== 'mandelbrot') return null;
	const { centerX, centerY } = scene.camera;
	let best: Landmark | null = null;
	let bestDist = Infinity;
	for (const l of LANDMARKS) {
		const d = Math.hypot(l.center.x - centerX, l.center.y - centerY);
		if (d <= l.radius && d < bestDist) {
			best = l;
			bestDist = d;
		}
	}
	return best;
}
