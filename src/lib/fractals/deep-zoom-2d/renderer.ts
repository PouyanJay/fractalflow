/**
 * Deep-Zoom 2D (Mandelbrot) fractal renderer plugin.
 *
 * The WGSL and GLSL fragment shaders mirror the CPU reference in reference.ts
 * (escape-time iteration + smooth coloring) and the cosine palette in
 * palette.ts. f32 precision here bounds zoom to ~1e-5; perturbation-based deep
 * zoom is a later phase.
 *
 * Uniform layout (std140-compatible, 96 bytes):
 *   0  resolution : vec2f
 *   8  center     : vec2f
 *   16 scale      : f32
 *   20 maxIter    : f32
 *   24 time       : f32
 *   28 pad        : f32
 *   32 palA       : vec4f (xyz used)
 *   48 palB       : vec4f
 *   64 palC       : vec4f
 *   80 palD       : vec4f
 */
import { PALETTES } from '$lib/fractals/palette';
import type { FractalRenderer, RenderInput, SceneState } from '$lib/engine/types';

export const DEEP_ZOOM_2D_ID = 'deep-zoom-2d';
export const UNIFORM_SIZE = 96;

export function createDefaultScene(): SceneState {
	return {
		camera: { centerX: -0.5, centerY: 0, scale: 3 },
		maxIter: 300,
		paletteIndex: 0
	};
}

const WGSL = /* wgsl */ `
struct Uniforms {
	resolution: vec2f,
	center: vec2f,
	scale: f32,
	maxIter: f32,
	time: f32,
	pad0: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
};
@group(0) @binding(0) var<uniform> u: Uniforms;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn palette(t: f32) -> vec3f {
	return clamp(u.palA.xyz + u.palB.xyz * cos(6.2831853 * (u.palC.xyz * t + u.palD.xyz)), vec3f(0.0), vec3f(1.0));
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
	let perPixel = u.scale / u.resolution.y;
	let cc = vec2f(
		u.center.x + (frag.x - u.resolution.x * 0.5) * perPixel,
		u.center.y - (frag.y - u.resolution.y * 0.5) * perPixel
	);
	var z = vec2f(0.0, 0.0);
	let maxI = i32(u.maxIter);
	var i = 0;
	loop {
		if (i >= maxI) { break; }
		let x2 = z.x * z.x;
		let y2 = z.y * z.y;
		if (x2 + y2 > 65536.0) { break; }
		z = vec2f(x2 - y2 + cc.x, 2.0 * z.x * z.y + cc.y);
		i = i + 1;
	}
	if (i >= maxI) {
		return vec4f(0.02, 0.02, 0.03, 1.0);
	}
	let logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	let nu = log(logZn / 0.6931472) / 0.6931472;
	let sm = f32(i) + 1.0 - nu;
	let t = fract(sm * 0.02);
	return vec4f(palette(t), 1.0);
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
	float uPad0;
	vec4 uPalA;
	vec4 uPalB;
	vec4 uPalC;
	vec4 uPalD;
};
out vec4 fragColor;

vec3 palette(float t) {
	return clamp(uPalA.xyz + uPalB.xyz * cos(6.2831853 * (uPalC.xyz * t + uPalD.xyz)), 0.0, 1.0);
}

void main() {
	float perPixel = uScale / uResolution.y;
	// gl_FragCoord origin is bottom-left (y up), so add to keep imag-up.
	vec2 cc = vec2(
		uCenter.x + (gl_FragCoord.x - uResolution.x * 0.5) * perPixel,
		uCenter.y + (gl_FragCoord.y - uResolution.y * 0.5) * perPixel
	);
	vec2 z = vec2(0.0);
	int maxI = int(uMaxIter);
	int i = 0;
	for (; i < maxI; i++) {
		float x2 = z.x * z.x;
		float y2 = z.y * z.y;
		if (x2 + y2 > 65536.0) break;
		z = vec2(x2 - y2 + cc.x, 2.0 * z.x * z.y + cc.y);
	}
	if (i >= maxI) {
		fragColor = vec4(0.02, 0.02, 0.03, 1.0);
		return;
	}
	float logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	float nu = log(logZn / 0.6931472) / 0.6931472;
	float sm = float(i) + 1.0 - nu;
	float t = fract(sm * 0.02);
	fragColor = vec4(palette(t), 1.0);
}`;

export const mandelbrotRenderer: FractalRenderer = {
	id: DEEP_ZOOM_2D_ID,
	wgsl: WGSL,
	glsl: GLSL,
	uniformSize: UNIFORM_SIZE,
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
		const c = (PALETTES[scene.paletteIndex] ?? PALETTES[0]).coeffs;
		f(32, c.a[0]);
		f(36, c.a[1]);
		f(40, c.a[2]);
		f(48, c.b[0]);
		f(52, c.b[1]);
		f(56, c.b[2]);
		f(64, c.c[0]);
		f(68, c.c[1]);
		f(72, c.c[2]);
		f(80, c.d[0]);
		f(84, c.d[1]);
		f(88, c.d[2]);
	}
};
