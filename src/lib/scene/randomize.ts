/**
 * Randomize & mutate — discover new looks from the current scene. `randomize`
 * throws fresh aesthetic dice (new palette, coloring, family, post) while
 * keeping where you're looking (camera + formula); `mutate` nudges those same
 * knobs a little for nearby variations (the Apophysis/JWildfire "mutagen" idea).
 *
 * Both are pure and seeded, so a given (scene, seed) is reproducible and they're
 * trivially testable. Every output stays inside each knob's valid range.
 */
import type { SceneState } from '$lib/engine/types';
import type { ArtStyleId } from '$lib/stores/ui-logic';
import { randomCustomCoeffs, resolvePalette, type PaletteCoeffs } from '$lib/fractals/palette';
import { COLORINGS } from '$lib/fractals/deep-zoom-2d/coloring';
import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
import { FLAMES } from '$lib/fractals/painterly-flames/flames';
import { IFS_SYSTEMS } from '$lib/fractals/ifs/ifs';
import { WARPS, warpDefaultAmount } from '$lib/fractals/post';

/** Small deterministic PRNG (mulberry32) — same family used across the engine. */
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

const pick = <T>(rng: () => number, arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const triple = (fn: (i: number) => number): [number, number, number] => [fn(0), fn(1), fn(2)];

/**
 * Throw fresh aesthetic dice: new palette, coloring mode, family selector, and a
 * random warp + grade. The camera, formula and 3D shape are kept so you stay on
 * the same subject — only the look changes.
 */
export function randomizeScene(
	scene: SceneState,
	style: ArtStyleId | null,
	seed: number
): SceneState {
	const rng = mulberry32(seed);
	const warp = pick(rng, WARPS).id;
	const next: SceneState = {
		...scene,
		paletteCoeffs: randomCustomCoeffs(rng),
		post: {
			...scene.post,
			warp,
			warpAmount: warpDefaultAmount(warp),
			hueShift: rng() - 0.5,
			saturation: 0.8 + rng() * 0.7
		}
	};

	if (style === 'deep-zoom-2d') {
		next.coloring = pick(rng, COLORINGS).id;
		if (scene.formula === 'julia' || scene.formula === 'phoenix') {
			next.juliaSeed = { x: (rng() * 2 - 1) * 0.8, y: (rng() * 2 - 1) * 0.8 };
		}
		if (scene.formula === 'multibrot') next.power = 2 + rng() * 6;
	} else if (style === 'attractors') {
		next.attractor = pick(rng, ATTRACTORS).id;
	} else if (style === 'flames') {
		next.flame = pick(rng, FLAMES).id;
	} else if (style === 'ifs') {
		next.ifs = pick(rng, IFS_SYSTEMS).id;
	}
	return next;
}

/**
 * Nudge the current look for a nearby variation: jitter the live palette and the
 * grade/seed/power within range, keeping every structural choice (camera,
 * formula, warp mode, family, coloring mode) fixed. `amount` ∈ (0,1] sets the step.
 */
export function mutateScene(
	scene: SceneState,
	style: ArtStyleId | null,
	seed: number,
	amount = 0.2
): SceneState {
	const rng = mulberry32(seed);
	const jit = () => (rng() * 2 - 1) * amount;
	// Start from the palette actually on screen (preset or custom) and jitter it.
	const base: PaletteCoeffs = scene.paletteCoeffs ?? resolvePalette(scene).coeffs;
	const coeffs: PaletteCoeffs = {
		a: triple((i) => clamp(base.a[i] + jit() * 0.5, 0, 1)),
		b: triple((i) => clamp(base.b[i] + jit() * 0.5, 0, 1)),
		c: triple((i) => clamp(base.c[i] + jit(), 0.5, 4)),
		d: triple((i) => (base.d[i] + jit()) % 1)
	};

	const next: SceneState = {
		...scene,
		paletteCoeffs: coeffs,
		post: {
			...scene.post,
			hueShift: clamp(scene.post.hueShift + jit(), -0.5, 0.5),
			saturation: Math.max(0, scene.post.saturation + jit())
		}
	};

	if (style === 'deep-zoom-2d') {
		if (scene.formula === 'julia' || scene.formula === 'phoenix') {
			next.juliaSeed = { x: scene.juliaSeed.x + jit() * 0.2, y: scene.juliaSeed.y + jit() * 0.2 };
		}
		if (scene.formula === 'multibrot') next.power = clamp((scene.power ?? 2) + jit() * 2, 2, 8);
	}
	return next;
}
