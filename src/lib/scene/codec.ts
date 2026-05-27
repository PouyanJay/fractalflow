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

const FORMULA_IDS: readonly FormulaId[] = [
	'mandelbrot',
	'julia',
	'burning-ship',
	'tricorn',
	'celtic',
	'buffalo',
	'perpendicular',
	'perpendicular-ship',
	'celtic-mandelbar',
	'multibrot',
	'newton',
	'phoenix'
];
const ATTRACTOR_IDS: readonly string[] = ATTRACTORS.map((a) => a.id);
const FLAME_IDS: readonly string[] = FLAMES.map((f) => f.id);
const WARP_IDS: readonly string[] = Object.keys(WARP_CODE);
const MIN_ITER = 1;
const MAX_ITER = 8000;
const SEPARATOR = '~';
// The double-double centre tails only affect the render once the zoom outruns
// f64's ~16 digits (deep-zoom needs them past ~1e10×). Above this scale they are
// pan/zoom rounding noise that can't move a pixel, so we drop them — keeping
// shallow share links short instead of carrying meaningless e-18 tails.
const LO_PRECISION_SCALE = 1e-9;

function clampInt(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, Math.round(value)));
}

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

/** The 12 inline custom-palette fields (a,b,c,d × rgb), or 12 zeros when absent. */
function paletteCoeffsFields(scene: SceneState): number[] {
	const p = scene.paletteCoeffs;
	if (!p) return Array(12).fill(0);
	return [...p.a, ...p.b, ...p.c, ...p.d];
}

export function encodeScene(scene: SceneState): string {
	const deep = scene.camera.scale < LO_PRECISION_SCALE;
	const fields: (string | number)[] = [
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
		// Extended-precision centre tails (double-double `lo`), for deep-zoom
		// reproducibility — only meaningful (and only carried) when deeply zoomed.
		deep ? (scene.camera.centerXLo ?? 0) : 0,
		deep ? (scene.camera.centerYLo ?? 0) : 0,
		// Multibrot exponent — default 2, so non-Multibrot scenes trim it away.
		scene.power ?? 2,
		// Inline custom cosine palette (12 values) — absent → all 0 → trimmed away.
		...paletteCoeffsFields(scene)
	];
	// Drop trailing fields equal to their default: decodeScene fills them back in,
	// so a shallow Mandelbrot collapses to `formula~cx~cy~scale` instead of 21
	// fields. Compared by serialized form, which is what actually round-trips.
	const d = createDefaultScene();
	const defaults = [
		d.formula,
		d.camera.centerX,
		d.camera.centerY,
		d.camera.scale,
		d.maxIter,
		d.paletteIndex,
		d.juliaSeed.x,
		d.juliaSeed.y,
		d.attractor,
		d.flame,
		d.post.warp,
		d.post.warpAmount,
		d.post.vignette,
		d.post.gamma,
		d.post.grain,
		d.post.bloom,
		d.post.bloomThreshold,
		d.post.bloomKnee,
		d.post.bloomRadius,
		0,
		0,
		2, // default Multibrot power
		...Array(12).fill(0) // default (absent) custom palette
	];
	let end = fields.length;
	while (end > 1 && String(fields[end - 1]) === String(defaults[end - 1])) end--;
	return fields.slice(0, end).join(SEPARATOR);
}

export function decodeScene(token: string): SceneState {
	const fallback = createDefaultScene();
	const parts = token.split(SEPARATOR);
	// Tokens are trimmed of trailing default fields, so any length ≥ 1 is valid;
	// each field below falls back to the default when missing or unparseable.
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
	// Multibrot exponent — only carried when non-default (2), matching the encoder.
	const power = num(parts[21], 2);
	// Inline custom palette (indices 22..33). Present iff any value is non-zero.
	const pc = Array.from({ length: 12 }, (_, i) => num(parts[22 + i], 0));
	const hasCustom = pc.some((v) => v !== 0);
	const paletteCoeffs = hasCustom
		? {
				a: [pc[0], pc[1], pc[2]] as [number, number, number],
				b: [pc[3], pc[4], pc[5]] as [number, number, number],
				c: [pc[6], pc[7], pc[8]] as [number, number, number],
				d: [pc[9], pc[10], pc[11]] as [number, number, number]
			}
		: undefined;

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
		},
		...(power !== 2 ? { power } : {}),
		...(paletteCoeffs ? { paletteCoeffs } : {})
	};
}
