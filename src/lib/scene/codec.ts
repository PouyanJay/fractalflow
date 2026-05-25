/**
 * Compact, URL-safe encoding of a Scene so a view is reproducible and
 * shareable: the full state (formula, camera, iterations, palette, Julia seed)
 * round-trips through a single token. Numbers use JS `toString`, which
 * preserves f64 exactly — important for deep-zoom coordinates. Decoding is
 * defensive: unknown/garbage input falls back to the default scene, and values
 * are clamped to valid ranges.
 */
import type { FormulaId, SceneState } from '$lib/engine/types';
import { PALETTES } from '$lib/fractals/palette';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
import { FLAMES } from '$lib/fractals/painterly-flames/flames';

const FORMULA_IDS: readonly FormulaId[] = ['mandelbrot', 'julia', 'burning-ship', 'tricorn'];
const ATTRACTOR_IDS: readonly string[] = ATTRACTORS.map((a) => a.id);
const FLAME_IDS: readonly string[] = FLAMES.map((f) => f.id);
const MIN_ITER = 50;
const MAX_ITER = 1200;
const SEPARATOR = '~';

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

export function encodeScene(scene: SceneState): string {
	return [
		scene.formula,
		scene.camera.centerX,
		scene.camera.centerY,
		scene.camera.scale,
		scene.maxIter,
		scene.paletteIndex,
		scene.juliaSeed.x,
		scene.juliaSeed.y,
		scene.attractor,
		scene.flame
	].join(SEPARATOR);
}

export function decodeScene(token: string): SceneState {
	const fallback = createDefaultScene();
	const parts = token.split(SEPARATOR);
	if (parts.length < 8) return fallback;

	const num = (raw: string, fb: number): number => {
		const n = Number(raw);
		return Number.isFinite(n) ? n : fb;
	};

	const formula = (FORMULA_IDS as readonly string[]).includes(parts[0])
		? (parts[0] as FormulaId)
		: fallback.formula;
	const scale = num(parts[3], fallback.camera.scale);

	return {
		formula,
		camera: {
			centerX: num(parts[1], fallback.camera.centerX),
			centerY: num(parts[2], fallback.camera.centerY),
			scale: scale > 0 ? scale : fallback.camera.scale
		},
		maxIter: clampInt(num(parts[4], fallback.maxIter), MIN_ITER, MAX_ITER),
		paletteIndex: clampInt(num(parts[5], fallback.paletteIndex), 0, PALETTES.length - 1),
		juliaSeed: {
			x: num(parts[6], fallback.juliaSeed.x),
			y: num(parts[7], fallback.juliaSeed.y)
		},
		attractor: ATTRACTOR_IDS.includes(parts[8]) ? parts[8] : fallback.attractor,
		flame: FLAME_IDS.includes(parts[9]) ? parts[9] : fallback.flame
	};
}
