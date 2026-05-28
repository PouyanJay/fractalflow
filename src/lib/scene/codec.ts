/**
 * Compact, URL-safe encoding of a Scene so a view is reproducible and
 * shareable: the full state (formula, camera, iterations, palette, Julia seed)
 * round-trips through a single token. Numbers use JS `toString`, which
 * preserves f64 exactly — important for deep-zoom coordinates. Decoding is
 * defensive: unknown/garbage input falls back to the default scene, and values
 * are clamped to valid ranges.
 */
import type { FormulaId, GeometricShapeId, SceneState } from '$lib/engine/types';
import { PALETTES } from '$lib/fractals/palette';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
import { FLAMES } from '$lib/fractals/painterly-flames/flames';
import { GEOMETRIC_SHAPES } from '$lib/fractals/geometric-3d/renderer';
import { IFS_SYSTEMS } from '$lib/fractals/ifs/ifs';
import { COLORINGS } from '$lib/fractals/deep-zoom-2d/coloring';
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
	'phoenix',
	'lyapunov',
	'apollonian',
	'nova'
];
const ATTRACTOR_IDS: readonly string[] = ATTRACTORS.map((a) => a.id);
const SHAPE_IDS: readonly string[] = GEOMETRIC_SHAPES.map((s) => s.id);
const FLAME_IDS: readonly string[] = FLAMES.map((f) => f.id);
const IFS_IDS: readonly string[] = IFS_SYSTEMS.map((s) => s.id);
const COLORING_IDS: readonly string[] = COLORINGS.map((c) => c.id);
const WARP_IDS: readonly string[] = Object.keys(WARP_CODE);
const MIN_ITER = 1;
const MAX_ITER = 8000;
const SEPARATOR = '~';
// The double-double centre tails only affect the render once the zoom outruns
// f64's ~16 digits (deep-zoom needs them past ~1e10×). Above this scale they are
// pan/zoom rounding noise that can't move a pixel, so we drop them — keeping
// shallow share links short instead of carrying meaningless e-18 tails.
const LO_PRECISION_SCALE = 1e-9;

// Positional field indices that hold an enum id (everything else is a number).
const ENUM_FIELDS: Record<number, readonly string[]> = {
	0: FORMULA_IDS,
	8: ATTRACTOR_IDS,
	9: FLAME_IDS,
	10: WARP_IDS,
	34: SHAPE_IDS,
	35: IFS_IDS,
	36: COLORING_IDS
};

// New tokens are a base64url binary blob prefixed with '.', which no legacy
// '~'-separated token ever starts with — so decode can tell the formats apart.
const TOKEN_PREFIX = '.';
const TOKEN_VERSION = 1;

function bytesToBase64url(bytes: Uint8Array): string {
	let bin = '';
	for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
	return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBytes(s: string): Uint8Array {
	const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/**
 * Serialize the trimmed positional field array to a compact binary blob: a
 * version byte, the field count, then each field — enums as a 1-byte id index,
 * every other field as a little-endian f64 (exact, so deep-zoom coordinates
 * round-trip to the bit). Replaces the old human-readable `~`-decimal join,
 * which spilled 17-digit floats into the URL.
 */
function serializeFields(fields: (string | number)[]): string {
	const buf = new ArrayBuffer(2 + fields.length * 8);
	const dv = new DataView(buf);
	let o = 0;
	dv.setUint8(o++, TOKEN_VERSION);
	dv.setUint8(o++, fields.length);
	for (let i = 0; i < fields.length; i++) {
		const enums = ENUM_FIELDS[i];
		if (enums) {
			const idx = enums.indexOf(String(fields[i]));
			dv.setUint8(o++, idx < 0 ? 0xff : idx);
		} else {
			dv.setFloat64(o, Number(fields[i]), true);
			o += 8;
		}
	}
	return bytesToBase64url(new Uint8Array(buf, 0, o));
}

/**
 * Inverse of serializeFields — rebuild the positional string array the decoder
 * consumes (enum index → id, f64 → its decimal string). Returns null on any
 * malformed/short input so decodeScene falls back to the default scene.
 */
function deserializeFields(blob: string): string[] | null {
	try {
		const bytes = base64urlToBytes(blob);
		const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
		let o = 0;
		if (dv.getUint8(o++) !== TOKEN_VERSION) return null;
		const count = dv.getUint8(o++);
		const parts: string[] = [];
		for (let i = 0; i < count; i++) {
			const enums = ENUM_FIELDS[i];
			if (enums) {
				parts.push(enums[dv.getUint8(o++)] ?? '');
			} else {
				parts.push(String(dv.getFloat64(o, true)));
				o += 8;
			}
		}
		return parts;
	} catch {
		return null;
	}
}

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
		...paletteCoeffsFields(scene),
		// Geometric 3D shape — default 'mandelbulb' trims away.
		scene.geometricShape ?? 'mandelbulb',
		// IFS system — appended last so older share links are unaffected; the
		// default 'barnsley-fern' trims away for every non-IFS scene.
		scene.ifs,
		// Coloring algorithm (Deep-Zoom 2D) — appended; default 'smooth' trims away.
		scene.coloring ?? 'smooth',
		// Grade additions — appended; defaults (0 hue, 1 saturation) trim away.
		scene.post.hueShift,
		scene.post.saturation
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
		...Array(12).fill(0), // default (absent) custom palette
		'mandelbulb', // default Geometric 3D shape
		d.ifs, // default IFS system
		'smooth', // default coloring
		0, // default hueShift
		1 // default saturation
	];
	let end = fields.length;
	while (end > 1 && String(fields[end - 1]) === String(defaults[end - 1])) end--;
	return TOKEN_PREFIX + serializeFields(fields.slice(0, end));
}

export function decodeScene(token: string): SceneState {
	// New binary tokens carry a '.' marker; everything else is a legacy
	// '~'-separated token (still emitted by older share links).
	const parts = token.startsWith(TOKEN_PREFIX)
		? deserializeFields(token.slice(1))
		: token.split(SEPARATOR);
	return decodeFields(parts ?? []);
}

function decodeFields(parts: string[]): SceneState {
	const fallback = createDefaultScene();
	// Tokens are trimmed of trailing default fields, so any length ≥ 0 is valid;
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
	// Geometric 3D shape (index 34) — validated, default mandelbulb when absent.
	const geometricShape = SHAPE_IDS.includes(parts[34])
		? (parts[34] as GeometricShapeId)
		: undefined;
	// IFS system (index 35) — validated, default when absent or unknown.
	const ifs = IFS_IDS.includes(parts[35]) ? parts[35] : fallback.ifs;
	// Coloring (index 36) — validated; absent/unknown/default decodes as undefined.
	const coloring =
		COLORING_IDS.includes(parts[36]) && parts[36] !== 'smooth'
			? (parts[36] as NonNullable<SceneState['coloring']>)
			: undefined;
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
		ifs,
		post: {
			warp: WARP_IDS.includes(parts[10]) ? parts[10] : fallback.post.warp,
			warpAmount: num(parts[11], fallback.post.warpAmount),
			vignette: num(parts[12], fallback.post.vignette),
			gamma: num(parts[13], fallback.post.gamma),
			grain: num(parts[14], fallback.post.grain),
			bloom: Math.max(0, num(parts[15], fallback.post.bloom)),
			bloomThreshold: Math.max(0, num(parts[16], fallback.post.bloomThreshold)),
			bloomKnee: clamp01(num(parts[17], fallback.post.bloomKnee)),
			bloomRadius: Math.max(0, num(parts[18], fallback.post.bloomRadius)),
			// Grade additions (indices 37/38) — default no-op when absent.
			hueShift: num(parts[37], fallback.post.hueShift),
			saturation: num(parts[38], fallback.post.saturation)
		},
		...(power !== 2 ? { power } : {}),
		...(paletteCoeffs ? { paletteCoeffs } : {}),
		...(geometricShape ? { geometricShape } : {}),
		...(coloring ? { coloring } : {})
	};
}
