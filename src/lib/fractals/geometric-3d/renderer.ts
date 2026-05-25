/**
 * Geometric 3D (Mandelbulb) renderer — raymarched in a fragment shader, so it
 * runs on both WebGPU and WebGL2. Reuses the shared Scene: camera.centerX is
 * the orbit yaw, camera.centerY the pitch, and camera.scale the orbit distance;
 * maxIter drives raymarch quality; paletteIndex/coloring use the cosine palette.
 *
 * Uniform layout (std140-compatible, 96 bytes):
 *   0  resolution : vec2f
 *   8  yaw        : f32   12 pitch : f32
 *   16 dist       : f32   20 power : f32
 *   24 time       : f32   28 detail: f32
 *   32 palA  48 palB  64 palC  80 palD : vec4f
 */
import { PALETTES } from '$lib/fractals/palette';
import type { FractalRenderer, RenderInput } from '$lib/engine/types';

export const GEOMETRIC_3D_ID = 'geometric-3d';
const UNIFORM_SIZE = 96;
const POWER = 8;

const WGSL = /* wgsl */ `
struct U {
	resolution: vec2f,
	yaw: f32,
	pitch: f32,
	dist: f32,
	power: f32,
	time: f32,
	detail: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
};
@group(0) @binding(0) var<uniform> u: U;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

fn palette(t: f32) -> vec3f {
	return clamp(u.palA.xyz + u.palB.xyz * cos(6.2831853 * (u.palC.xyz * t + u.palD.xyz)), vec3f(0.0), vec3f(1.0));
}

// Mandelbulb distance estimate; returns (distance, orbit-trap).
fn de(pos: vec3f) -> vec2f {
	var z = pos;
	var dr = 1.0;
	var r = 0.0;
	var trap = 1e10;
	for (var i = 0; i < 8; i = i + 1) {
		r = length(z);
		if (r > 2.0) { break; }
		let rr = max(r, 1e-6);
		let theta = acos(clamp(z.z / rr, -1.0, 1.0)) * u.power;
		let phi = atan2(z.y, z.x) * u.power;
		dr = pow(rr, u.power - 1.0) * u.power * dr + 1.0;
		let zr = pow(rr, u.power);
		z = zr * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + pos;
		trap = min(trap, r);
	}
	return vec2f(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

fn normalAt(p: vec3f) -> vec3f {
	let e = 0.0008;
	return normalize(vec3f(
		de(p + vec3f(e, 0.0, 0.0)).x - de(p - vec3f(e, 0.0, 0.0)).x,
		de(p + vec3f(0.0, e, 0.0)).x - de(p - vec3f(0.0, e, 0.0)).x,
		de(p + vec3f(0.0, 0.0, e)).x - de(p - vec3f(0.0, 0.0, e)).x
	));
}

@fragment
fn fs(@builtin(position) frag: vec4f) -> @location(0) vec4f {
	let uvx = (frag.x - 0.5 * u.resolution.x) / u.resolution.y;
	let uvy = -(frag.y - 0.5 * u.resolution.y) / u.resolution.y;

	let cp = cos(u.pitch);
	let sp = sin(u.pitch);
	let cy = cos(u.yaw);
	let sy = sin(u.yaw);
	let ro = u.dist * vec3f(cp * sy, sp, cp * cy);
	let forward = normalize(-ro);
	let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
	let up = cross(right, forward);
	let rd = normalize(forward + uvx * 1.2 * right + uvy * 1.2 * up);

	var t = 0.0;
	var hit = false;
	var trap = 1.0;
	let maxSteps = i32(clamp(u.detail, 60.0, 200.0));
	for (var i = 0; i < maxSteps; i = i + 1) {
		let pos = ro + rd * t;
		let res = de(pos);
		if (res.x < 0.0006 * t + 0.00002) {
			hit = true;
			trap = res.y;
			break;
		}
		t = t + res.x;
		if (t > 8.0) { break; }
	}

	if (!hit) {
		let bg = mix(vec3f(0.02, 0.02, 0.03), vec3f(0.05, 0.06, 0.09), uvy + 0.5);
		return vec4f(bg, 1.0);
	}

	let pos = ro + rd * t;
	let n = normalAt(pos);
	let lightDir = normalize(vec3f(0.6, 0.7, 0.4));
	let diff = max(dot(n, lightDir), 0.0);
	let amb = 0.25 + 0.2 * (0.5 + 0.5 * n.y);
	let col = palette(fract(trap * 1.5 + 0.5)) * (amb + 0.85 * diff);
	return vec4f(col, 1.0);
}
`;

const GLSL = /* glsl */ `#version 300 es
precision highp float;
layout(std140) uniform Uniforms {
	vec2 uResolution;
	float uYaw;
	float uPitch;
	float uDist;
	float uPower;
	float uTime;
	float uDetail;
	vec4 uPalA;
	vec4 uPalB;
	vec4 uPalC;
	vec4 uPalD;
};
out vec4 fragColor;

vec3 palette(float t) {
	return clamp(uPalA.xyz + uPalB.xyz * cos(6.2831853 * (uPalC.xyz * t + uPalD.xyz)), 0.0, 1.0);
}

vec2 de(vec3 pos) {
	vec3 z = pos;
	float dr = 1.0;
	float r = 0.0;
	float trap = 1e10;
	for (int i = 0; i < 8; i++) {
		r = length(z);
		if (r > 2.0) break;
		float rr = max(r, 1e-6);
		float theta = acos(clamp(z.z / rr, -1.0, 1.0)) * uPower;
		float phi = atan(z.y, z.x) * uPower;
		dr = pow(rr, uPower - 1.0) * uPower * dr + 1.0;
		float zr = pow(rr, uPower);
		z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + pos;
		trap = min(trap, r);
	}
	return vec2(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

vec3 normalAt(vec3 p) {
	float e = 0.0008;
	return normalize(vec3(
		de(p + vec3(e, 0.0, 0.0)).x - de(p - vec3(e, 0.0, 0.0)).x,
		de(p + vec3(0.0, e, 0.0)).x - de(p - vec3(0.0, e, 0.0)).x,
		de(p + vec3(0.0, 0.0, e)).x - de(p - vec3(0.0, 0.0, e)).x
	));
}

void main() {
	float uvx = (gl_FragCoord.x - 0.5 * uResolution.x) / uResolution.y;
	float uvy = (gl_FragCoord.y - 0.5 * uResolution.y) / uResolution.y;

	float cp = cos(uPitch);
	float sp = sin(uPitch);
	float cy = cos(uYaw);
	float sy = sin(uYaw);
	vec3 ro = uDist * vec3(cp * sy, sp, cp * cy);
	vec3 forward = normalize(-ro);
	vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(right, forward);
	vec3 rd = normalize(forward + uvx * 1.2 * right + uvy * 1.2 * up);

	float t = 0.0;
	bool hit = false;
	float trap = 1.0;
	int maxSteps = int(clamp(uDetail, 60.0, 200.0));
	for (int i = 0; i < maxSteps; i++) {
		vec3 pos = ro + rd * t;
		vec2 res = de(pos);
		if (res.x < 0.0006 * t + 0.00002) { hit = true; trap = res.y; break; }
		t += res.x;
		if (t > 8.0) break;
	}

	if (!hit) {
		vec3 bg = mix(vec3(0.02, 0.02, 0.03), vec3(0.05, 0.06, 0.09), uvy + 0.5);
		fragColor = vec4(bg, 1.0);
		return;
	}

	vec3 pos = ro + rd * t;
	vec3 n = normalAt(pos);
	vec3 lightDir = normalize(vec3(0.6, 0.7, 0.4));
	float diff = max(dot(n, lightDir), 0.0);
	float amb = 0.25 + 0.2 * (0.5 + 0.5 * n.y);
	vec3 col = palette(fract(trap * 1.5 + 0.5)) * (amb + 0.85 * diff);
	fragColor = vec4(col, 1.0);
}`;

export const mandelbulbRenderer: FractalRenderer = {
	id: GEOMETRIC_3D_ID,
	kind: '3d',
	wgsl: WGSL,
	glsl: GLSL,
	uniformSize: UNIFORM_SIZE,
	packUniforms(view: DataView, input: RenderInput) {
		const { width, height, timeMs, scene } = input;
		const f = (offset: number, value: number) => view.setFloat32(offset, value, true);
		f(0, width);
		f(4, height);
		f(8, scene.camera.centerX); // yaw
		f(12, scene.camera.centerY); // pitch
		f(16, scene.camera.scale); // distance
		f(20, POWER);
		f(24, timeMs);
		f(28, scene.maxIter); // raymarch quality
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
