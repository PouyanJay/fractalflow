/**
 * Bloom (HDR glow) — the shared, backend-agnostic model for the render-to-texture
 * bloom pyramid. The effect is a Call-of-Duty / Jimenez-style progressive
 * downsample → upsample:
 *
 *   1. bright pass: a Karis-averaged 13-tap downsample of the scene into mip0,
 *      with a soft-knee threshold so only bright areas glow;
 *   2. downsample chain: plain 13-tap downsamples mip0 → mip1 → … (wider blur);
 *   3. upsample chain: 3×3 tent upsamples added back up the pyramid;
 *   4. composite: scene + intensity · bloom, then the colour grade.
 *
 * The numeric core (luminance, soft-knee prefilter, Karis weight, mip depth, and
 * the two convolution kernels) lives here as a CPU reference and is unit-tested;
 * the WGSL/GLSL snippets below mirror it exactly so both backends agree. Each
 * backend ($lib/engine/backends/{webgpu,webgl2}-bloom) splices these into its
 * own pass plumbing. `ffGradeApply` (the grade) is supplied by $lib/fractals/post
 * and spliced ahead of the composite shader, keeping a single grade definition.
 */
import type { RenderInput } from '$lib/engine/types';

/** Intensity 0 disables bloom entirely (no render-to-texture cost). */
export const DEFAULT_BLOOM_INTENSITY = 0;
export const DEFAULT_BLOOM_THRESHOLD = 0.8;
export const DEFAULT_BLOOM_KNEE = 0.5;
export const DEFAULT_BLOOM_RADIUS = 1;

/** Pyramid depth cap — enough for a wide glow at 4K without unbounded passes. */
export const MAX_BLOOM_MIPS = 6;

/** Bytes of the per-pass bloom uniform block (std140, multiple of 16). */
export const BLOOM_UNIFORM_SIZE = 48;

/**
 * WGSL entry-point names, shared between the shader text below and the backend's
 * pipeline creation so a rename can't silently desync (a mismatch would only
 * surface as async pipeline-validation failure, i.e. bloom quietly disabled).
 */
export const BLOOM_ENTRY = {
	vs: 'vs',
	prefilter: 'fsPrefilter',
	downsample: 'fsDownsample',
	upsample: 'fsUpsample',
	composite: 'fsComposite'
} as const;

type RGB = [number, number, number];
/** A bilinear sampler over a source image in normalised [0,1] coordinates. */
export type Sampler = (u: number, v: number) => readonly [number, number, number];

/** Rec.709 relative luminance. */
export function luminance(r: number, g: number, b: number): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Soft-knee bright-pass prefilter (Unity/Jimenez quadratic threshold). Scales a
 * colour by how far its peak channel exceeds `threshold`, with a smooth `knee`
 * rolloff (0 = hard cutoff). Returns black well below the threshold.
 */
export function prefilter(rgb: RGB, threshold: number, knee: number): RGB {
	const [r, g, b] = rgb;
	const brightness = Math.max(r, g, b);
	const kneeVal = threshold * knee;
	let rq = Math.min(Math.max(brightness - (threshold - kneeVal), 0), 2 * kneeVal);
	rq = (rq * rq * 0.25) / Math.max(kneeVal, 1e-4);
	const contribution = Math.max(rq, brightness - threshold) / Math.max(brightness, 1e-4);
	return [r * contribution, g * contribution, b * contribution];
}

/** Karis average weight (1/(1+luma)) — tames fireflies on the first downsample. */
export function karisWeight(luma: number): number {
	return 1 / (1 + luma);
}

/** Pyramid depth for a drawing-buffer size: deeper for larger buffers, capped. */
export function mipLevelCount(width: number, height: number): number {
	const min = Math.max(1, Math.min(width, height));
	// −1 stops the pyramid a level above 1×1: the coarsest mip stays a few texels
	// wide, where the tent filter still has neighbours to blur.
	const levels = Math.floor(Math.log2(min)) - 1;
	return Math.max(1, Math.min(MAX_BLOOM_MIPS, levels));
}

/**
 * `input` with bloom intensity zeroed — clears the `bloomActive` uniform flag so
 * a renderer applies its grade in-shader. Used by every backend for the path
 * where bloom was requested but its pipeline is unavailable, keeping the
 * "intensity 0 ⇒ grade in-shader" contract in one place.
 */
export function withBloomDisabled(input: RenderInput): RenderInput {
	return { ...input, scene: { ...input.scene, post: { ...input.scene.post, bloom: 0 } } };
}

const add = (a: RGB, b: readonly [number, number, number], w: number): void => {
	a[0] += b[0] * w;
	a[1] += b[1] * w;
	a[2] += b[2] * w;
};

/**
 * 13-tap downsample (five overlapping 2×2 boxes; weights sum to 1). With
 * `karis`, each box is weighted by its Karis average for firefly suppression.
 * `tx`/`ty` are the source texel size in normalised coordinates.
 */
export function downsample13(
	sample: Sampler,
	u: number,
	v: number,
	tx: number,
	ty: number,
	karis = false
): RGB {
	const at = (dx: number, dy: number) => sample(u + dx * tx, v + dy * ty);
	const a = at(-2, -2),
		b = at(0, -2),
		c = at(2, -2);
	const d = at(-2, 0),
		e = at(0, 0),
		f = at(2, 0);
	const g = at(-2, 2),
		h = at(0, 2),
		i = at(2, 2);
	const j = at(-1, -1),
		k = at(1, -1),
		l = at(-1, 1),
		m = at(1, 1);

	const box = (
		p: readonly number[],
		q: readonly number[],
		r: readonly number[],
		s: readonly number[]
	): RGB => [
		(p[0] + q[0] + r[0] + s[0]) * 0.25,
		(p[1] + q[1] + r[1] + s[1]) * 0.25,
		(p[2] + q[2] + r[2] + s[2]) * 0.25
	];
	const center = box(j, k, l, m);
	const tl = box(a, b, d, e);
	const tr = box(b, c, e, f);
	const bl = box(d, e, g, h);
	const br = box(e, f, h, i);

	const out: RGB = [0, 0, 0];
	if (karis) {
		const w = [
			0.5 * karisWeight(luminance(...center)),
			0.125 * karisWeight(luminance(...tl)),
			0.125 * karisWeight(luminance(...tr)),
			0.125 * karisWeight(luminance(...bl)),
			0.125 * karisWeight(luminance(...br))
		];
		const total = w[0] + w[1] + w[2] + w[3] + w[4];
		add(out, center, w[0] / total);
		add(out, tl, w[1] / total);
		add(out, tr, w[2] / total);
		add(out, bl, w[3] / total);
		add(out, br, w[4] / total);
	} else {
		add(out, center, 0.5);
		add(out, tl, 0.125);
		add(out, tr, 0.125);
		add(out, bl, 0.125);
		add(out, br, 0.125);
	}
	return out;
}

/** 3×3 tent upsample ([1 2 1; 2 4 2; 1 2 1]/16); `radius` scales the spread. */
export function upsampleTent(
	sample: Sampler,
	u: number,
	v: number,
	tx: number,
	ty: number,
	radius: number
): RGB {
	const ox = tx * radius,
		oy = ty * radius;
	const out: RGB = [0, 0, 0];
	add(out, sample(u - ox, v - oy), 1);
	add(out, sample(u, v - oy), 2);
	add(out, sample(u + ox, v - oy), 1);
	add(out, sample(u - ox, v), 2);
	add(out, sample(u, v), 4);
	add(out, sample(u + ox, v), 2);
	add(out, sample(u - ox, v + oy), 1);
	add(out, sample(u, v + oy), 2);
	add(out, sample(u + ox, v + oy), 1);
	return [out[0] / 16, out[1] / 16, out[2] / 16];
}

// --- Shader snippets (mirror the maths above) ----------------------------------

/**
 * WGSL bloom module. Declares the BloomU uniform, a clamp sampler, a source
 * texture (@binding 2) and a second texture (@binding 3, scene image for the
 * composite pass), plus entry points: `vs`, `fsPrefilter`, `fsDownsample`,
 * `fsUpsample`, `fsComposite`. The composite calls `ffGradeApply`, which the
 * backend prepends (post.GRADE_WGSL_FN). Texture sampling flips V for WebGPU's
 * top-left texture origin.
 */
export const BLOOM_WGSL = /* wgsl */ `
struct BloomU {
	srcTexel: vec2f,
	threshold: f32,
	knee: f32,
	radius: f32,
	intensity: f32,
	gamma: f32,
	vignette: f32,
	grain: f32,
	hueShift: f32,
	saturation: f32,
};
@group(0) @binding(0) var<uniform> bu: BloomU;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var srcTex: texture_2d<f32>;
@group(0) @binding(3) var sceneTex: texture_2d<f32>;

struct VsOut { @builtin(position) pos: vec4f, @location(0) uv: vec2f };

@vertex
fn ${BLOOM_ENTRY.vs}(@builtin(vertex_index) vi: u32) -> VsOut {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	var o: VsOut;
	o.pos = vec4f(p * 2.0 - 1.0, 0.0, 1.0);
	o.uv = vec2f(p.x, 1.0 - p.y);
	return o;
}

fn lum(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }
fn src(uv: vec2f) -> vec3f { return textureSampleLevel(srcTex, samp, uv, 0.0).rgb; }

fn prefilterColour(c: vec3f) -> vec3f {
	let br = max(c.r, max(c.g, c.b));
	let kneeVal = bu.threshold * bu.knee;
	var rq = clamp(br - (bu.threshold - kneeVal), 0.0, 2.0 * kneeVal);
	rq = rq * rq * 0.25 / max(kneeVal, 1e-4);
	let contribution = max(rq, br - bu.threshold) / max(br, 1e-4);
	return c * contribution;
}

fn box(p: vec3f, q: vec3f, r: vec3f, s: vec3f) -> vec3f { return (p + q + r + s) * 0.25; }

fn down13(uv: vec2f, karis: bool) -> vec3f {
	let tx = bu.srcTexel;
	let a = src(uv + tx * vec2f(-2.0, -2.0)); let b = src(uv + tx * vec2f(0.0, -2.0)); let c = src(uv + tx * vec2f(2.0, -2.0));
	let d = src(uv + tx * vec2f(-2.0,  0.0)); let e = src(uv + tx * vec2f(0.0,  0.0)); let f = src(uv + tx * vec2f(2.0,  0.0));
	let g = src(uv + tx * vec2f(-2.0,  2.0)); let h = src(uv + tx * vec2f(0.0,  2.0)); let i = src(uv + tx * vec2f(2.0,  2.0));
	let j = src(uv + tx * vec2f(-1.0, -1.0)); let k = src(uv + tx * vec2f(1.0, -1.0));
	let l = src(uv + tx * vec2f(-1.0,  1.0)); let m = src(uv + tx * vec2f(1.0,  1.0));
	let center = box(j, k, l, m);
	let tl = box(a, b, d, e); let tr = box(b, c, e, f);
	let bl = box(d, e, g, h); let br2 = box(e, f, h, i);
	if (karis) {
		let w0 = 0.5   / (1.0 + lum(center));
		let w1 = 0.125 / (1.0 + lum(tl));
		let w2 = 0.125 / (1.0 + lum(tr));
		let w3 = 0.125 / (1.0 + lum(bl));
		let w4 = 0.125 / (1.0 + lum(br2));
		return (center * w0 + tl * w1 + tr * w2 + bl * w3 + br2 * w4) / (w0 + w1 + w2 + w3 + w4);
	}
	return center * 0.5 + (tl + tr + bl + br2) * 0.125;
}

fn tent(uv: vec2f) -> vec3f {
	let o = bu.srcTexel * bu.radius;
	var r = src(uv + vec2f(-o.x, -o.y)) * 1.0;
	r += src(uv + vec2f(0.0, -o.y)) * 2.0;
	r += src(uv + vec2f(o.x, -o.y)) * 1.0;
	r += src(uv + vec2f(-o.x, 0.0)) * 2.0;
	r += src(uv) * 4.0;
	r += src(uv + vec2f(o.x, 0.0)) * 2.0;
	r += src(uv + vec2f(-o.x, o.y)) * 1.0;
	r += src(uv + vec2f(0.0, o.y)) * 2.0;
	r += src(uv + vec2f(o.x, o.y)) * 1.0;
	return r / 16.0;
}

@fragment fn ${BLOOM_ENTRY.prefilter}(@location(0) uv: vec2f) -> @location(0) vec4f {
	return vec4f(prefilterColour(down13(uv, true)), 1.0);
}
@fragment fn ${BLOOM_ENTRY.downsample}(@location(0) uv: vec2f) -> @location(0) vec4f {
	return vec4f(down13(uv, false), 1.0);
}
@fragment fn ${BLOOM_ENTRY.upsample}(@location(0) uv: vec2f) -> @location(0) vec4f {
	return vec4f(tent(uv), 1.0);
}
@fragment fn ${BLOOM_ENTRY.composite}(@location(0) uv: vec2f) -> @location(0) vec4f {
	let scene = textureSampleLevel(sceneTex, samp, uv, 0.0).rgb;
	let glow = textureSampleLevel(srcTex, samp, uv, 0.0).rgb;
	let combined = scene + glow * bu.intensity;
	return vec4f(ffGradeApply(combined, uv, bu.gamma, bu.vignette, bu.grain, bu.hueShift, bu.saturation), 1.0);
}`;

/** GLSL fullscreen-triangle vertex shader for the bloom passes. */
export const BLOOM_GLSL_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
	vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
	gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
	vUv = p; // WebGL texture origin is bottom-left — no V flip needed.
}`;

/** Common GLSL preamble shared by every bloom fragment program. */
const BLOOM_GLSL_COMMON = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
layout(std140) uniform BloomU {
	vec2 uSrcTexel;
	float uThreshold;
	float uKnee;
	float uRadius;
	float uIntensity;
	float uGamma;
	float uVignette;
	float uGrain;
	float uHueShift;
	float uSaturation;
};
uniform sampler2D uSrc;
uniform sampler2D uScene;

float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 srcAt(vec2 uv) { return texture(uSrc, uv).rgb; }
vec3 boxAvg(vec3 p, vec3 q, vec3 r, vec3 s) { return (p + q + r + s) * 0.25; }

vec3 prefilterColour(vec3 c) {
	float br = max(c.r, max(c.g, c.b));
	float kneeVal = uThreshold * uKnee;
	float rq = clamp(br - (uThreshold - kneeVal), 0.0, 2.0 * kneeVal);
	rq = rq * rq * 0.25 / max(kneeVal, 1e-4);
	float contribution = max(rq, br - uThreshold) / max(br, 1e-4);
	return c * contribution;
}

vec3 down13(vec2 uv, bool karis) {
	vec2 tx = uSrcTexel;
	vec3 a = srcAt(uv + tx * vec2(-2.0, -2.0)); vec3 b = srcAt(uv + tx * vec2(0.0, -2.0)); vec3 c = srcAt(uv + tx * vec2(2.0, -2.0));
	vec3 d = srcAt(uv + tx * vec2(-2.0,  0.0)); vec3 e = srcAt(uv + tx * vec2(0.0,  0.0)); vec3 f = srcAt(uv + tx * vec2(2.0,  0.0));
	vec3 g = srcAt(uv + tx * vec2(-2.0,  2.0)); vec3 h = srcAt(uv + tx * vec2(0.0,  2.0)); vec3 i = srcAt(uv + tx * vec2(2.0,  2.0));
	vec3 j = srcAt(uv + tx * vec2(-1.0, -1.0)); vec3 k = srcAt(uv + tx * vec2(1.0, -1.0));
	vec3 l = srcAt(uv + tx * vec2(-1.0,  1.0)); vec3 m = srcAt(uv + tx * vec2(1.0,  1.0));
	vec3 center = boxAvg(j, k, l, m);
	vec3 tl = boxAvg(a, b, d, e); vec3 tr = boxAvg(b, c, e, f);
	vec3 bl = boxAvg(d, e, g, h); vec3 br = boxAvg(e, f, h, i);
	if (karis) {
		float w0 = 0.5   / (1.0 + lum(center));
		float w1 = 0.125 / (1.0 + lum(tl));
		float w2 = 0.125 / (1.0 + lum(tr));
		float w3 = 0.125 / (1.0 + lum(bl));
		float w4 = 0.125 / (1.0 + lum(br));
		return (center * w0 + tl * w1 + tr * w2 + bl * w3 + br * w4) / (w0 + w1 + w2 + w3 + w4);
	}
	return center * 0.5 + (tl + tr + bl + br) * 0.125;
}

vec3 tent(vec2 uv) {
	vec2 o = uSrcTexel * uRadius;
	vec3 r = srcAt(uv + vec2(-o.x, -o.y)) * 1.0;
	r += srcAt(uv + vec2(0.0, -o.y)) * 2.0;
	r += srcAt(uv + vec2(o.x, -o.y)) * 1.0;
	r += srcAt(uv + vec2(-o.x, 0.0)) * 2.0;
	r += srcAt(uv) * 4.0;
	r += srcAt(uv + vec2(o.x, 0.0)) * 2.0;
	r += srcAt(uv + vec2(-o.x, o.y)) * 1.0;
	r += srcAt(uv + vec2(0.0, o.y)) * 2.0;
	r += srcAt(uv + vec2(o.x, o.y)) * 1.0;
	return r / 16.0;
}`;

export const BLOOM_GLSL_PREFILTER_FS = `${BLOOM_GLSL_COMMON}
void main() { fragColor = vec4(prefilterColour(down13(vUv, true)), 1.0); }`;

export const BLOOM_GLSL_DOWNSAMPLE_FS = `${BLOOM_GLSL_COMMON}
void main() { fragColor = vec4(down13(vUv, false), 1.0); }`;

export const BLOOM_GLSL_UPSAMPLE_FS = `${BLOOM_GLSL_COMMON}
void main() { fragColor = vec4(tent(vUv), 1.0); }`;

/** Composite FS; the backend prepends post.GRADE_GLSL_FN (defines ffGradeApply). */
export const BLOOM_GLSL_COMPOSITE_FS_BODY = `
void main() {
	vec3 scene = texture(uScene, vUv).rgb;
	vec3 glow = texture(uSrc, vUv).rgb;
	vec3 combined = scene + glow * uIntensity;
	fragColor = vec4(ffGradeApply(combined, vUv, uGamma, uVignette, uGrain, uHueShift, uSaturation), 1.0);
}`;

/** Assemble the composite FS: common preamble + grade fn + body. */
export function compositeGlslFs(gradeFn: string): string {
	return `${BLOOM_GLSL_COMMON}\n${gradeFn}\n${BLOOM_GLSL_COMPOSITE_FS_BODY}`;
}

/**
 * Pack the per-pass bloom uniform block. `srcTexel` is the source texture's
 * texel size (1/w, 1/h); the grade fields are only read by the composite pass.
 */
export function packBloomUniform(
	view: DataView,
	srcTexelW: number,
	srcTexelH: number,
	post: {
		bloom: number;
		bloomThreshold: number;
		bloomKnee: number;
		bloomRadius: number;
		gamma: number;
		vignette: number;
		grain: number;
		hueShift: number;
		saturation: number;
	}
): void {
	view.setFloat32(0, srcTexelW, true);
	view.setFloat32(4, srcTexelH, true);
	view.setFloat32(8, post.bloomThreshold, true);
	view.setFloat32(12, post.bloomKnee, true);
	view.setFloat32(16, post.bloomRadius, true);
	view.setFloat32(20, post.bloom, true);
	view.setFloat32(24, post.gamma, true);
	view.setFloat32(28, post.vignette, true);
	view.setFloat32(32, post.grain, true);
	view.setFloat32(36, post.hueShift, true);
	view.setFloat32(40, post.saturation, true);
}
