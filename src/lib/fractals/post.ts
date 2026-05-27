/**
 * Post-processing: a screen-space warp plus colour grading applied at the end
 * of every renderer's fragment stage. Lives in the shared Scene (so it saves,
 * shares and animates) and is edited via the Compose Warp/Post-FX nodes. The
 * default is a no-op, so a scene with no effects renders exactly as before.
 *
 * Each renderer splices `POST_WGSL_FIELDS`/`POST_GLSL_FIELDS` into its uniform
 * struct (whose variable is named `u`), includes `POST_WGSL_FN`/`POST_GLSL_FN`,
 * warps its input coordinate with `ffWarp`, grades its output with `ffPost`,
 * and writes the block with `packPost`. The warp maths mirror warpKaleido /
 * warpMirror below.
 */

import type { PostSettings } from '$lib/engine/types';
import {
	DEFAULT_BLOOM_INTENSITY,
	DEFAULT_BLOOM_THRESHOLD,
	DEFAULT_BLOOM_KNEE,
	DEFAULT_BLOOM_RADIUS
} from './bloom';
export type { PostSettings };

/** A coordinate warp and the shape of its single `warpAmount` control. */
export interface WarpMeta {
	id: string;
	label: string;
	/** Label/range for the amount slider (absent → the warp takes no amount). */
	amount?: { label: string; min: number; max: number; step: number; default: number };
}

export const WARPS: readonly WarpMeta[] = [
	{ id: 'none', label: 'None' },
	{
		id: 'kaleido',
		label: 'Kaleidoscope',
		amount: { label: 'Segments', min: 2, max: 16, step: 1, default: 6 }
	},
	{ id: 'mirror', label: 'Mirror' },
	{
		id: 'swirl',
		label: 'Swirl',
		amount: { label: 'Twist', min: 0, max: 12, step: 0.1, default: 4 }
	},
	{
		id: 'ripple',
		label: 'Ripple',
		amount: { label: 'Frequency', min: 2, max: 24, step: 0.5, default: 9 }
	},
	{
		id: 'fisheye',
		label: 'Fisheye',
		amount: { label: 'Bulge', min: 0.3, max: 2.5, step: 0.05, default: 1.6 }
	},
	{
		id: 'fold',
		label: 'Symmetry',
		amount: { label: 'Folds', min: 2, max: 12, step: 1, default: 6 }
	}
];

export const WARP_CODE: Record<string, number> = {
	none: 0,
	kaleido: 1,
	mirror: 2,
	swirl: 3,
	ripple: 4,
	fisheye: 5,
	fold: 6
};

/** The default `warpAmount` for a warp (so switching warps lands in range). */
export function warpDefaultAmount(id: string): number {
	return WARPS.find((w) => w.id === id)?.amount?.default ?? 6;
}

export const DEFAULT_POST: PostSettings = {
	warp: 'none',
	warpAmount: 6,
	vignette: 0,
	gamma: 1,
	grain: 0,
	hueShift: 0,
	saturation: 1,
	// Bloom defaults live in $lib/fractals/bloom; intensity 0 keeps it off (no-op).
	bloom: DEFAULT_BLOOM_INTENSITY,
	bloomThreshold: DEFAULT_BLOOM_THRESHOLD,
	bloomKnee: DEFAULT_BLOOM_KNEE,
	bloomRadius: DEFAULT_BLOOM_RADIUS
};

/** Bytes the post block occupies in a uniform buffer (std140-aligned). */
export const POST_SIZE = 32;

/**
 * Write the post block at `base`: warp code (u32), four grade floats, then the
 * `bloomActive` flag. Bloom's amounts (threshold/knee/radius/intensity) are
 * consumed by the backend's bloom pyramid, not this in-shader block; the
 * renderer only needs to know whether to *defer* its grade so bloom can run
 * before it. `bloomActive` reuses what was padding — the layout is unchanged.
 */
export function packPost(view: DataView, base: number, post: PostSettings): void {
	view.setUint32(base, WARP_CODE[post.warp] ?? 0, true);
	view.setFloat32(base + 4, post.warpAmount, true);
	view.setFloat32(base + 8, post.vignette, true);
	view.setFloat32(base + 12, post.gamma, true);
	view.setFloat32(base + 16, post.grain, true);
	view.setFloat32(base + 20, post.bloom > 0 ? 1 : 0, true);
	view.setFloat32(base + 24, post.hueShift, true); // former padding
	view.setFloat32(base + 28, post.saturation, true); // former padding
}

// --- CPU reference for the warps (mirrored exactly in the shader snippets) ---

export function warpMirror(x: number, y: number): [number, number] {
	return [Math.abs(x), y];
}

export function warpKaleido(x: number, y: number, segments: number): [number, number] {
	const seg = (2 * Math.PI) / Math.max(segments, 1);
	let a = Math.atan2(y, x);
	a = a - seg * Math.floor(a / seg);
	a = Math.abs(a - seg * 0.5);
	const r = Math.hypot(x, y);
	return [r * Math.cos(a), r * Math.sin(a)];
}

/** Swirl: rotate each point by an angle proportional to its radius. */
export function warpSwirl(x: number, y: number, twist: number): [number, number] {
	const r = Math.hypot(x, y);
	const a = Math.atan2(y, x) + twist * r * 0.3;
	return [r * Math.cos(a), r * Math.sin(a)];
}

/** Ripple: a radial sinusoidal expansion/contraction at the given frequency. */
export function warpRipple(x: number, y: number, freq: number): [number, number] {
	const f = 1 + 0.08 * Math.sin(Math.hypot(x, y) * freq);
	return [x * f, y * f];
}

/** Fisheye: raise the radius to a power (>1 bulges out, <1 pinches in). */
export function warpFisheye(x: number, y: number, power: number): [number, number] {
	const r = Math.hypot(x, y);
	if (r < 1e-6) return [x, y];
	const rr = Math.pow(r, power);
	return [(x * rr) / r, (y * rr) / r];
}

/** N-fold rotational symmetry: fold the angle into one wedge (no mirror). */
export function warpFold(x: number, y: number, folds: number): [number, number] {
	const seg = (2 * Math.PI) / Math.max(folds, 1);
	let a = Math.atan2(y, x);
	a = a - seg * Math.floor(a / seg);
	const r = Math.hypot(x, y);
	return [r * Math.cos(a), r * Math.sin(a)];
}

// --- Shader snippets (uniform variable must be named `u`) ---

export const POST_WGSL_FIELDS = `	warp: u32,
	warpAmount: f32,
	vignette: f32,
	gamma: f32,
	grain: f32,
	bloomActive: f32,
	hueShift: f32,
	saturation: f32,`;

/**
 * The colour grade (gamma → vignette → grain), parameterised so it can run
 * either inline in a renderer (`ffPost`) or in the bloom composite pass. The
 * bloom backend splices this ahead of its composite shader.
 */
export const GRADE_WGSL_FN = /* wgsl */ `
// Hue rotation about the (1,1,1) luma axis, in turns.
fn ffHueRotate(c: vec3f, turns: f32) -> vec3f {
	let a = turns * 6.2831853;
	let k = vec3f(0.57735026);
	let ca = cos(a);
	return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
fn ffGradeApply(rgb: vec3f, uv: vec2f, gamma: f32, vignette: f32, grain: f32, hue: f32, saturation: f32) -> vec3f {
	var c = max(rgb, vec3f(0.0));
	c = pow(c, vec3f(1.0 / max(gamma, 0.01)));
	let l = dot(c, vec3f(0.2126, 0.7152, 0.0722));
	c = mix(vec3f(l), c, saturation); // saturation (1 = unchanged)
	if (abs(hue) > 1e-4) { c = ffHueRotate(c, hue); }
	let d = length(uv - vec2f(0.5));
	c = c * (1.0 - vignette * smoothstep(0.25, 0.85, d));
	if (grain > 0.0) {
		let n = fract(sin(dot(uv, vec2f(12.9898, 78.233))) * 43758.5453);
		c = c + (n - 0.5) * grain;
	}
	return clamp(c, vec3f(0.0), vec3f(1.0));
}`;

export const POST_WGSL_FN = /* wgsl */ `${GRADE_WGSL_FN}
fn ffWarp(p: vec2f) -> vec2f {
	let r = length(p);
	if (u.warp == 1u) { // kaleidoscope (mirrored n-fold)
		let seg = 6.2831853 / max(u.warpAmount, 1.0);
		var a = atan2(p.y, p.x);
		a = a - seg * floor(a / seg);
		a = abs(a - seg * 0.5);
		return vec2f(cos(a), sin(a)) * r;
	}
	if (u.warp == 2u) { return vec2f(abs(p.x), p.y); } // mirror
	if (u.warp == 3u) { // swirl
		let a = atan2(p.y, p.x) + u.warpAmount * r * 0.3;
		return vec2f(cos(a), sin(a)) * r;
	}
	if (u.warp == 4u) { return p * (1.0 + 0.08 * sin(r * u.warpAmount)); } // ripple
	if (u.warp == 5u) { // fisheye
		if (r < 1e-6) { return p; }
		return p * (pow(r, u.warpAmount) / r);
	}
	if (u.warp == 6u) { // n-fold rotational symmetry
		let seg = 6.2831853 / max(u.warpAmount, 1.0);
		var a = atan2(p.y, p.x);
		a = a - seg * floor(a / seg);
		return vec2f(cos(a), sin(a)) * r;
	}
	return p;
}

fn ffPost(col: vec4f, uv: vec2f) -> vec4f {
	// Bloom runs before the grade: hand the raw (ungraded, unclamped) colour to
	// the offscreen target and let the composite pass grade after adding glow.
	if (u.bloomActive > 0.5) { return vec4f(max(col.rgb, vec3f(0.0)), col.a); }
	return vec4f(ffGradeApply(col.rgb, uv, u.gamma, u.vignette, u.grain, u.hueShift, u.saturation), col.a);
}`;

export const POST_GLSL_FIELDS = `	uint uWarp;
	float uWarpAmount;
	float uVignette;
	float uGamma;
	float uGrain;
	float uBloomActive;
	float uHueShift;
	float uSaturation;`;

export const GRADE_GLSL_FN = /* glsl */ `
vec3 ffHueRotate(vec3 c, float turns) {
	float a = turns * 6.2831853;
	vec3 k = vec3(0.57735026);
	float ca = cos(a);
	return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
vec3 ffGradeApply(vec3 rgb, vec2 uv, float gamma, float vignette, float grain, float hue, float saturation) {
	vec3 c = max(rgb, 0.0);
	c = pow(c, vec3(1.0 / max(gamma, 0.01)));
	float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
	c = mix(vec3(l), c, saturation);
	if (abs(hue) > 1e-4) { c = ffHueRotate(c, hue); }
	float d = length(uv - vec2(0.5));
	c = c * (1.0 - vignette * smoothstep(0.25, 0.85, d));
	if (grain > 0.0) {
		float n = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
		c = c + (n - 0.5) * grain;
	}
	return clamp(c, 0.0, 1.0);
}`;

export const POST_GLSL_FN = /* glsl */ `${GRADE_GLSL_FN}
vec2 ffWarp(vec2 p) {
	float r = length(p);
	if (uWarp == 1u) { // kaleidoscope
		float seg = 6.2831853 / max(uWarpAmount, 1.0);
		float a = atan(p.y, p.x);
		a = a - seg * floor(a / seg);
		a = abs(a - seg * 0.5);
		return vec2(cos(a), sin(a)) * r;
	}
	if (uWarp == 2u) { return vec2(abs(p.x), p.y); } // mirror
	if (uWarp == 3u) { // swirl
		float a = atan(p.y, p.x) + uWarpAmount * r * 0.3;
		return vec2(cos(a), sin(a)) * r;
	}
	if (uWarp == 4u) { return p * (1.0 + 0.08 * sin(r * uWarpAmount)); } // ripple
	if (uWarp == 5u) { // fisheye
		if (r < 1e-6) { return p; }
		return p * (pow(r, uWarpAmount) / r);
	}
	if (uWarp == 6u) { // n-fold rotational symmetry
		float seg = 6.2831853 / max(uWarpAmount, 1.0);
		float a = atan(p.y, p.x);
		a = a - seg * floor(a / seg);
		return vec2(cos(a), sin(a)) * r;
	}
	return p;
}

vec4 ffPost(vec4 col, vec2 uv) {
	// Bloom runs before the grade — emit raw colour to the offscreen target.
	if (uBloomActive > 0.5) { return vec4(max(col.rgb, 0.0), col.a); }
	return vec4(ffGradeApply(col.rgb, uv, uGamma, uVignette, uGrain, uHueShift, uSaturation), col.a);
}`;
