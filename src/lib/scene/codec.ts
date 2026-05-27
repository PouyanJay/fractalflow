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
import { WARP_CODE } from '$lib/fractals/post';

const FORMULA_IDS: readonly FormulaId[] = ['mandelbrot', 'julia', 'burning-ship', 'tricorn'];
const ATTRACTOR_IDS: readonly string[] = ATTRACTORS.map((a) => a.id);
const FLAME_IDS: readonly string[] = FLAMES.map((f) => f.id);
const WARP_IDS: readonly string[] = Object.keys(WARP_CODE);
const MIN_ITER = 1;
const MAX_ITER = 8000;
const SEPARATOR = '~';

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

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
		scene.flame,
		scene.post.warp,
		scene.post.warpAmount,
		scene.post.vignette,
		scene.post.gamma,
		scene.post.grain,
		scene.post.bloom,
		scene.post.bloomThreshold,
		scene.post.bloomKnee,
		scene.post.bloomRadius,
		// Extended-precision centre tails (double-double `lo`), for deep-zoom reproducibility.
		scene.camera.centerXLo ?? 0,
		scene.camera.centerYLo ?? 0
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
	// Extended-precision centre tails — only carried when present (a shallow scene
	// has none, so it round-trips byte-identically to its f64-only form).
	const centerXLo = num(parts[19], 0);
	const centerYLo = num(parts[20], 0);

	return {
		formula,
		camera: {
			centerX: num(parts[1], fallback.camera.centerX),
			centerY: num(parts[2], fallback.camera.centerY),
			scale: scale > 0 ? scale : fallback.camera.scale,
			...(centerXLo !== 0 ? { centerXLo } : {}),
			...(centerYLo !== 0 ? { centerYLo } : {})
		},
		maxIter: clampInt(num(parts[4], fallback.maxIter), MIN_ITER, MAX_ITER),
		paletteIndex: clampInt(num(parts[5], fallback.paletteIndex), 0, PALETTES.length - 1),
		juliaSeed: {
			x: num(parts[6], fallback.juliaSeed.x),
			y: num(parts[7], fallback.juliaSeed.y)
		},
		attractor: ATTRACTOR_IDS.includes(parts[8]) ? parts[8] : fallback.attractor,
		flame: FLAME_IDS.includes(parts[9]) ? parts[9] : fallback.flame,
		post: {
			warp: WARP_IDS.includes(parts[10]) ? parts[10] : fallback.post.warp,
			warpAmount: num(parts[11], fallback.post.warpAmount),
			vignette: num(parts[12], fallback.post.vignette),
			gamma: num(parts[13], fallback.post.gamma),
			grain: num(parts[14], fallback.post.grain),
			bloom: Math.max(0, num(parts[15], fallback.post.bloom)),
			bloomThreshold: Math.max(0, num(parts[16], fallback.post.bloomThreshold)),
			bloomKnee: clamp01(num(parts[17], fallback.post.bloomKnee)),
			bloomRadius: Math.max(0, num(parts[18], fallback.post.bloomRadius))
		}
	};
}
