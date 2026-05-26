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
}

const FORMULA_TEXT: Record<FormulaId, SceneDescription> = {
	mandelbrot: {
		title: 'Mandelbrot',
		body: 'The Mandelbrot set — iterate z → z² + c and keep the c that never escape. Its boundary is endlessly intricate, the same motifs recurring at every scale.'
	},
	julia: {
		title: 'Julia set',
		body: 'A Julia set — fix c and vary the starting z. It is connected exactly when that c lies inside the Mandelbrot set; the seed shapes the whole filigree.'
	},
	'burning-ship': {
		title: 'Burning Ship',
		body: 'The Burning Ship — fold z by its absolute value each step. The result reads like fractal hulls ablaze on a dark sea.'
	},
	tricorn: {
		title: 'Tricorn',
		body: 'The Tricorn (Mandelbar) — conjugate z each iteration. Its three-fold symmetry gives the boundary a faceted, anti-holomorphic character.'
	}
};

const STYLE_TEXT: Record<Exclude<ArtStyleId, 'deep-zoom-2d'>, SceneDescription> = {
	'geometric-3d': {
		title: 'Mandelbulb',
		body: 'A raymarched Mandelbulb — an escape-time fractal lifted into 3D and lit like a sculpture. Orbit and dolly to read its surface.'
	},
	attractors: {
		title: 'Glowing Attractor',
		body: 'A strange attractor — a single chaotic orbit traced for millions of steps, its visited points accumulated into a luminous cloud.'
	},
	flames: {
		title: 'Painterly Flame',
		body: 'A fractal flame — the chaos game over a set of affine + variation transforms, with colour accumulated along the orbit.'
	}
};

const GENERIC: SceneDescription = {
	title: 'Fractal',
	body: 'Pick an art style in the Library to explore a fractal here.'
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
