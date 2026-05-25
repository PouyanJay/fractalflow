/**
 * Deep-Zoom 2D fractal renderer plugin (Mandelbrot / Julia / Burning Ship /
 * Tricorn). The shaders mirror the CPU references (reference.ts + perturbation.ts)
 * and the cosine palette (palette.ts).
 *
 * Mandelbrot uses **perturbation**: an f64 reference orbit at the view center
 * (computed on the CPU, uploaded as f32) plus small per-pixel deltas, so it
 * zooms far past the f32 ~1e-5 wall. The other formulas use direct f32
 * iteration (no deep zoom yet). This is single-reference perturbation without
 * glitch correction — deep views in some regions may show artifacts.
 *
 * Uniform layout (std140-compatible, 112 bytes):
 *   0   resolution : vec2f      24  time        : f32
 *   8   center     : vec2f      28  formula     : f32
 *   16  scale      : f32        32  seed        : vec2f
 *   20  maxIter    : f32        40  orbitLength : f32   44 pad : f32
 *   48  palA  64 palB  80 palC  96 palD : vec4f
 */
import { PALETTES } from '$lib/fractals/palette';
import {
	DEFAULT_POST,
	POST_SIZE,
	packPost,
	POST_WGSL_FIELDS,
	POST_WGSL_FN,
	POST_GLSL_FIELDS,
	POST_GLSL_FN
} from '$lib/fractals/post';
import { FORMULA_CODES } from './reference';
import { computeReferenceOrbit } from './perturbation';
import type { FractalRenderer, RenderInput, SceneState } from '$lib/engine/types';

export const DEEP_ZOOM_2D_ID = 'deep-zoom-2d';
const POST_BASE = 112;
export const UNIFORM_SIZE = POST_BASE + POST_SIZE;

const MAX_ITER_CAP = 1200;
const MAX_ORBIT = MAX_ITER_CAP + 1;
const DATA_BUFFER_SIZE = MAX_ORBIT * 2 * 4;

export function createDefaultScene(): SceneState {
	return {
		formula: 'mandelbrot',
		camera: { centerX: -0.5, centerY: 0, scale: 3 },
		maxIter: 300,
		paletteIndex: 0,
		juliaSeed: { x: -0.8, y: 0.156 },
		attractor: 'clifford',
		flame: 'sierpinski',
		post: { ...DEFAULT_POST }
	};
}

// One-entry memo so packUniforms and packData share a single orbit computation
// per frame (they are called with the same input each frame).
const EMPTY_DATA = new Float32Array(2);
let memoKey = '';
let memoData = new Float32Array(2);
let memoLength = 0;

function orbitFor(input: RenderInput): { data: Float32Array; length: number } {
	const s = input.scene;
	if (s.formula !== 'mandelbrot') {
		// Other formulas use direct iteration; no reference orbit needed.
		return { data: EMPTY_DATA, length: 0 };
	}
	const key = `${s.camera.centerX}|${s.camera.centerY}|${s.maxIter}`;
	if (key !== memoKey) {
		const iter = Math.min(s.maxIter, MAX_ITER_CAP);
		const orbit = computeReferenceOrbit(s.camera.centerX, s.camera.centerY, iter);
		const data = new Float32Array(orbit.length * 2);
		for (let i = 0; i < orbit.length; i++) {
			data[i * 2] = orbit.xs[i];
			data[i * 2 + 1] = orbit.ys[i];
		}
		memoKey = key;
		memoData = data;
		memoLength = orbit.length;
	}
	return { data: memoData, length: memoLength };
}

const WGSL = /* wgsl */ `
struct Uniforms {
	resolution: vec2f,
	center: vec2f,
	scale: f32,
	maxIter: f32,
	time: f32,
	formula: f32,
	seed: vec2f,
	orbitLength: f32,
	pad0: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
${POST_WGSL_FIELDS}
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> orbit: array<vec2f>;
${POST_WGSL_FN}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn palette(t: f32) -> vec3f {
	return clamp(u.palA.xyz + u.palB.xyz * cos(6.2831853 * (u.palC.xyz * t + u.palD.xyz)), vec3f(0.0), vec3f(1.0));
}

fn color(n: f32, z: vec2f) -> vec4f {
	let logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	let nu = log(logZn / 0.6931472) / 0.6931472;
	return vec4f(palette(fract((n + 1.0 - nu) * 0.02)), 1.0);
}

const INTERIOR = vec4f(0.02, 0.02, 0.03, 1.0);

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
	let uv = frag.xy / u.resolution;
	let perPixel = u.scale / u.resolution.y;
	let offset = ffWarp(vec2f(
		(frag.x - u.resolution.x * 0.5) * perPixel,
		-(frag.y - u.resolution.y * 0.5) * perPixel
	));
	let formula = i32(u.formula);
	let maxI = i32(u.maxIter);

	if (formula == 0) {
		// Mandelbrot via perturbation + rebasing around the reference orbit.
		let lim = i32(u.orbitLength);
		var dz = vec2f(0.0, 0.0);
		var refIdx = 0;
		var iter = 0;
		loop {
			if (iter >= maxI) { break; }
			let Z = orbit[refIdx];
			let twoZd = vec2f(2.0 * (Z.x * dz.x - Z.y * dz.y), 2.0 * (Z.x * dz.y + Z.y * dz.x));
			let d2 = vec2f(dz.x * dz.x - dz.y * dz.y, 2.0 * dz.x * dz.y);
			dz = twoZd + d2 + offset;
			refIdx = refIdx + 1;
			let z = orbit[refIdx] + dz;
			let zmag = z.x * z.x + z.y * z.y;
			if (zmag > 65536.0) { return ffPost(color(f32(iter + 1), z), uv); }
			if (zmag < dz.x * dz.x + dz.y * dz.y || refIdx >= lim - 1) {
				dz = z;
				refIdx = 0;
			}
			iter = iter + 1;
		}
		return ffPost(INTERIOR, uv);
	}

	// Julia / Burning Ship / Tricorn: direct f32 iteration.
	let cc = u.center + offset;
	var z: vec2f;
	var cparam: vec2f;
	if (formula == 1) {
		z = cc;
		cparam = u.seed;
	} else {
		z = vec2f(0.0, 0.0);
		cparam = cc;
	}
	var i = 0;
	loop {
		if (i >= maxI) { break; }
		if (z.x * z.x + z.y * z.y > 65536.0) { return ffPost(color(f32(i), z), uv); }
		if (formula == 2) {
			let ax = abs(z.x);
			let ay = abs(z.y);
			z = vec2f(ax * ax - ay * ay + cparam.x, 2.0 * ax * ay + cparam.y);
		} else if (formula == 3) {
			z = vec2f(z.x * z.x - z.y * z.y + cparam.x, -2.0 * z.x * z.y + cparam.y);
		} else {
			z = vec2f(z.x * z.x - z.y * z.y + cparam.x, 2.0 * z.x * z.y + cparam.y);
		}
		i = i + 1;
	}
	return ffPost(INTERIOR, uv);
}
`;

const GLSL = /* glsl */ `#version 300 es
precision highp float;
layout(std140) uniform Uniforms {
	vec2 uResolution;
	vec2 uCenter;
	float uScale;
	float uMaxIter;
	float uTime;
	float uFormula;
	vec2 uSeed;
	float uOrbitLength;
	float uPad0;
	vec4 uPalA;
	vec4 uPalB;
	vec4 uPalC;
	vec4 uPalD;
${POST_GLSL_FIELDS}
};
uniform highp sampler2D uOrbit;
out vec4 fragColor;
${POST_GLSL_FN}

vec3 palette(float t) {
	return clamp(uPalA.xyz + uPalB.xyz * cos(6.2831853 * (uPalC.xyz * t + uPalD.xyz)), 0.0, 1.0);
}

vec4 colorOf(float n, vec2 z) {
	float logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	float nu = log(logZn / 0.6931472) / 0.6931472;
	return vec4(palette(fract((n + 1.0 - nu) * 0.02)), 1.0);
}

const vec4 INTERIOR = vec4(0.02, 0.02, 0.03, 1.0);

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution;
	float perPixel = uScale / uResolution.y;
	vec2 offset = ffWarp(vec2(
		(gl_FragCoord.x - uResolution.x * 0.5) * perPixel,
		(gl_FragCoord.y - uResolution.y * 0.5) * perPixel
	));
	int formula = int(uFormula);
	int maxI = int(uMaxIter);

	if (formula == 0) {
		int lim = int(uOrbitLength);
		vec2 dz = vec2(0.0);
		int refIdx = 0;
		for (int iter = 0; iter < maxI; iter++) {
			vec2 Z = texelFetch(uOrbit, ivec2(refIdx, 0), 0).rg;
			vec2 twoZd = vec2(2.0 * (Z.x * dz.x - Z.y * dz.y), 2.0 * (Z.x * dz.y + Z.y * dz.x));
			vec2 d2 = vec2(dz.x * dz.x - dz.y * dz.y, 2.0 * dz.x * dz.y);
			dz = twoZd + d2 + offset;
			refIdx += 1;
			vec2 z = texelFetch(uOrbit, ivec2(refIdx, 0), 0).rg + dz;
			float zmag = z.x * z.x + z.y * z.y;
			if (zmag > 65536.0) { fragColor = ffPost(colorOf(float(iter + 1), z), uv); return; }
			if (zmag < dz.x * dz.x + dz.y * dz.y || refIdx >= lim - 1) {
				dz = z;
				refIdx = 0;
			}
		}
		fragColor = ffPost(INTERIOR, uv);
		return;
	}

	vec2 cc = uCenter + offset;
	vec2 z;
	vec2 cparam;
	if (formula == 1) { z = cc; cparam = uSeed; }
	else { z = vec2(0.0); cparam = cc; }
	int i = 0;
	for (; i < maxI; i++) {
		if (z.x * z.x + z.y * z.y > 65536.0) { fragColor = ffPost(colorOf(float(i), z), uv); return; }
		if (formula == 2) {
			float ax = abs(z.x);
			float ay = abs(z.y);
			z = vec2(ax * ax - ay * ay + cparam.x, 2.0 * ax * ay + cparam.y);
		} else if (formula == 3) {
			z = vec2(z.x * z.x - z.y * z.y + cparam.x, -2.0 * z.x * z.y + cparam.y);
		} else {
			z = vec2(z.x * z.x - z.y * z.y + cparam.x, 2.0 * z.x * z.y + cparam.y);
		}
	}
	fragColor = ffPost(INTERIOR, uv);
}`;

export const mandelbrotRenderer: FractalRenderer = {
	id: DEEP_ZOOM_2D_ID,
	kind: '2d',
	wgsl: WGSL,
	glsl: GLSL,
	uniformSize: UNIFORM_SIZE,
	dataBufferSize: DATA_BUFFER_SIZE,
	packData(input: RenderInput) {
		return orbitFor(input).data;
	},
	packUniforms(view: DataView, input: RenderInput) {
		const { width, height, timeMs, scene } = input;
		const f = (offset: number, value: number) => view.setFloat32(offset, value, true);
		f(0, width);
		f(4, height);
		f(8, scene.camera.centerX);
		f(12, scene.camera.centerY);
		f(16, scene.camera.scale);
		f(20, scene.maxIter);
		f(24, timeMs);
		f(28, FORMULA_CODES[scene.formula]);
		f(32, scene.juliaSeed.x);
		f(36, scene.juliaSeed.y);
		f(40, orbitFor(input).length);
		const c = (PALETTES[scene.paletteIndex] ?? PALETTES[0]).coeffs;
		f(48, c.a[0]);
		f(52, c.a[1]);
		f(56, c.a[2]);
		f(64, c.b[0]);
		f(68, c.b[1]);
		f(72, c.b[2]);
		f(80, c.c[0]);
		f(84, c.c[1]);
		f(88, c.c[2]);
		f(96, c.d[0]);
		f(100, c.d[1]);
		f(104, c.d[2]);
		packPost(view, POST_BASE, scene.post);
	}
};
