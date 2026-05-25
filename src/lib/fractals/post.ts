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
export type { PostSettings };

export const WARPS: readonly { id: string; label: string }[] = [
	{ id: 'none', label: 'None' },
	{ id: 'kaleido', label: 'Kaleidoscope' },
	{ id: 'mirror', label: 'Mirror' }
];

export const WARP_CODE: Record<string, number> = { none: 0, kaleido: 1, mirror: 2 };

export const DEFAULT_POST: PostSettings = {
	warp: 'none',
	warpAmount: 6,
	vignette: 0,
	gamma: 1,
	grain: 0
};

/** Bytes the post block occupies in a uniform buffer (std140-aligned). */
export const POST_SIZE = 32;

/** Write the post block at `base`: warp code (u32) then four grade floats. */
export function packPost(view: DataView, base: number, post: PostSettings): void {
	view.setUint32(base, WARP_CODE[post.warp] ?? 0, true);
	view.setFloat32(base + 4, post.warpAmount, true);
	view.setFloat32(base + 8, post.vignette, true);
	view.setFloat32(base + 12, post.gamma, true);
	view.setFloat32(base + 16, post.grain, true);
	// base + 20..31 padding.
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

// --- Shader snippets (uniform variable must be named `u`) ---

export const POST_WGSL_FIELDS = `	warp: u32,
	warpAmount: f32,
	vignette: f32,
	gamma: f32,
	grain: f32,
	postPad0: f32,
	postPad1: f32,
	postPad2: f32,`;

export const POST_WGSL_FN = /* wgsl */ `
fn ffWarp(p: vec2f) -> vec2f {
	if (u.warp == 1u) {
		let seg = 6.2831853 / max(u.warpAmount, 1.0);
		var a = atan2(p.y, p.x);
		a = a - seg * floor(a / seg);
		a = abs(a - seg * 0.5);
		let r = length(p);
		return vec2f(cos(a), sin(a)) * r;
	}
	if (u.warp == 2u) { return vec2f(abs(p.x), p.y); }
	return p;
}

fn ffPost(col: vec4f, uv: vec2f) -> vec4f {
	var c = max(col.rgb, vec3f(0.0));
	c = pow(c, vec3f(1.0 / max(u.gamma, 0.01)));
	let d = length(uv - vec2f(0.5));
	c = c * (1.0 - u.vignette * smoothstep(0.25, 0.85, d));
	if (u.grain > 0.0) {
		let n = fract(sin(dot(uv, vec2f(12.9898, 78.233))) * 43758.5453);
		c = c + (n - 0.5) * u.grain;
	}
	return vec4f(clamp(c, vec3f(0.0), vec3f(1.0)), col.a);
}`;

export const POST_GLSL_FIELDS = `	uint uWarp;
	float uWarpAmount;
	float uVignette;
	float uGamma;
	float uGrain;
	float uPostPad0;
	float uPostPad1;
	float uPostPad2;`;

export const POST_GLSL_FN = /* glsl */ `
vec2 ffWarp(vec2 p) {
	if (uWarp == 1u) {
		float seg = 6.2831853 / max(uWarpAmount, 1.0);
		float a = atan(p.y, p.x);
		a = a - seg * floor(a / seg);
		a = abs(a - seg * 0.5);
		float r = length(p);
		return vec2(cos(a), sin(a)) * r;
	}
	if (uWarp == 2u) { return vec2(abs(p.x), p.y); }
	return p;
}

vec4 ffPost(vec4 col, vec2 uv) {
	vec3 c = max(col.rgb, 0.0);
	c = pow(c, vec3(1.0 / max(uGamma, 0.01)));
	float d = length(uv - vec2(0.5));
	c = c * (1.0 - uVignette * smoothstep(0.25, 0.85, d));
	if (uGrain > 0.0) {
		float n = fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453);
		c = c + (n - 0.5) * uGrain;
	}
	return vec4(clamp(c, 0.0, 1.0), col.a);
}`;
