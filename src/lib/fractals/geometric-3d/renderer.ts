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
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL, COLORMAP_GLSL } from '$lib/fractals/colormaps';
import {
	POST_SIZE,
	packPost,
	POST_WGSL_FIELDS,
	POST_WGSL_FN,
	POST_GLSL_FIELDS,
	POST_GLSL_FN
} from '$lib/fractals/post';
import type { FractalRenderer, GeometricShapeId, RenderInput } from '$lib/engine/types';

export const GEOMETRIC_3D_ID = 'geometric-3d';
const POST_BASE = 96;
const UNIFORM_SIZE = POST_BASE + POST_SIZE;
const POWER = 8;

/** The raymarched shapes, with the integer code passed to the shader (palD.w). */
export const GEOMETRIC_SHAPES: { id: GeometricShapeId; label: string }[] = [
	{ id: 'mandelbulb', label: 'Mandelbulb' },
	{ id: 'mandelbox', label: 'Mandelbox' },
	{ id: 'menger', label: 'Menger Sponge' },
	{ id: 'juliabulb', label: 'Juliabulb' },
	{ id: 'quaternion-julia', label: 'Quaternion Julia' }
];
const SHAPE_CODE: Record<GeometricShapeId, number> = {
	mandelbulb: 0,
	mandelbox: 1,
	menger: 2,
	juliabulb: 3,
	'quaternion-julia': 4
};

const WGSL = /* wgsl */ `
struct U {
	resolution: vec2f,
	yaw: f32,
	pitch: f32,
	zoom: f32,
	power: f32,
	time: f32,
	detail: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
${POST_WGSL_FIELDS}
};
@group(0) @binding(0) var<uniform> u: U;
${POST_WGSL_FN}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
}

${COLORMAP_WGSL}

fn palette(t: f32) -> vec3f {
	let cm = i32(u.palA.w);
	if (cm > 0) { return cmap(cm, t); }
	return clamp(u.palA.xyz + u.palB.xyz * cos(6.2831853 * (u.palC.xyz * t + u.palD.xyz)), vec3f(0.0), vec3f(1.0));
}

// Power-map bulb (Mandelbulb = offset pos; Juliabulb = fixed offset c). Returns
// (distance, orbit-trap). Mirrors the spherical-coordinate iteration in the docs.
fn bulbDE(pos: vec3f, offset: vec3f) -> vec2f {
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
		z = zr * vec3f(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + offset;
		trap = min(trap, r);
	}
	return vec2f(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

// Mandelbox: alternating box-fold + sphere-fold + linear scale.
fn deMandelbox(p0: vec3f) -> vec2f {
	let SCALE = 2.5;
	var z = p0;
	var dr = 1.0;
	var trap = 1e10;
	for (var i = 0; i < 11; i = i + 1) {
		z = clamp(z, vec3f(-1.0), vec3f(1.0)) * 2.0 - z; // box fold
		let r2 = dot(z, z);
		if (r2 < 0.25) { let f = 4.0; z = z * f; dr = dr * f; }
		else if (r2 < 1.0) { let f = 1.0 / r2; z = z * f; dr = dr * f; }
		z = z * SCALE + p0;
		dr = dr * abs(SCALE) + 1.0;
		trap = min(trap, length(z));
	}
	return vec2f(length(z) / abs(dr), trap);
}

fn sdBox(p: vec3f, b: vec3f) -> f32 {
	let d = abs(p) - b;
	return length(max(d, vec3f(0.0))) + min(max(d.x, max(d.y, d.z)), 0.0);
}

// Menger sponge (Inigo Quilez): iterative cross subtraction from a box.
fn deMenger(p0: vec3f) -> vec2f {
	var d = sdBox(p0, vec3f(1.0));
	var s = 1.0;
	for (var m = 0; m < 4; m = m + 1) {
		let ps = p0 * s;
		let a = ps - 2.0 * floor(ps / 2.0) - 1.0; // mod(p*s, 2) − 1
		s = s * 3.0;
		let r = abs(1.0 - 3.0 * abs(a));
		let c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s;
		d = max(d, c);
	}
	return vec2f(d, length(p0) * 0.5);
}

fn qmul(a: vec4f, b: vec4f) -> vec4f {
	return vec4f(
		a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
		a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
		a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
		a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x
	);
}

// Quaternion Julia: z ← z² + c in the quaternions, 3D slice at w = 0.
fn deQuat(pos: vec3f) -> vec2f {
	let c = vec4f(-0.45, -0.45, 0.18, 0.3);
	var z = vec4f(pos, 0.0);
	var dz = vec4f(1.0, 0.0, 0.0, 0.0);
	var trap = 1e10;
	for (var i = 0; i < 10; i = i + 1) {
		dz = 2.0 * qmul(z, dz);
		z = qmul(z, z) + c;
		let m = dot(z, z);
		trap = min(trap, m);
		if (m > 4.0) { break; }
	}
	let r = length(z);
	return vec2f(0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6), trap);
}

fn de(pos: vec3f) -> vec2f {
	let shape = i32(u.palD.w);
	if (shape == 1) { let d = deMandelbox(pos * 2.4); return vec2f(d.x / 2.4, d.y); }
	if (shape == 2) { return deMenger(pos); }
	if (shape == 3) { return bulbDE(pos, vec3f(0.4, 0.3, 0.2)); }
	if (shape == 4) { return deQuat(pos); }
	return bulbDE(pos, pos); // mandelbulb
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
	let postUv = frag.xy / u.resolution;
	let warped = ffWarp(vec2f(
		(frag.x - 0.5 * u.resolution.x) / u.resolution.y,
		-(frag.y - 0.5 * u.resolution.y) / u.resolution.y
	));
	let uvx = warped.x;
	let uvy = warped.y;

	let cp = cos(u.pitch);
	let sp = sin(u.pitch);
	let cy = cos(u.yaw);
	let sy = sin(u.yaw);
	let ro = 2.8 * vec3f(cp * sy, sp, cp * cy);
	let forward = normalize(-ro);
	let right = normalize(cross(forward, vec3f(0.0, 1.0, 0.0)));
	let up = cross(right, forward);
	let fov = 1.2 * u.zoom;
	let rd = normalize(forward + uvx * fov * right + uvy * fov * up);

	var t = 0.0;
	var hit = false;
	var trap = 1.0;
	let maxSteps = i32(clamp(u.detail, 60.0, 200.0));
	for (var i = 0; i < maxSteps; i = i + 1) {
		let pos = ro + rd * t;
		let res = de(pos);
		if (res.x < max(0.0015 * u.zoom * t, 1e-6)) {
			hit = true;
			trap = res.y;
			break;
		}
		t = t + res.x;
		if (t > 8.0) { break; }
	}

	if (!hit) {
		let bg = mix(vec3f(0.02, 0.02, 0.03), vec3f(0.05, 0.06, 0.09), uvy + 0.5);
		return ffPost(vec4f(bg, 1.0), postUv);
	}

	let pos = ro + rd * t;
	let n = normalAt(pos);
	let lightDir = normalize(vec3f(0.6, 0.7, 0.4));
	let diff = max(dot(n, lightDir), 0.0);
	let amb = 0.25 + 0.2 * (0.5 + 0.5 * n.y);
	let col = palette(fract(trap * 1.5 + 0.5)) * (amb + 0.85 * diff);
	return ffPost(vec4f(col, 1.0), postUv);
}
`;

const GLSL = /* glsl */ `#version 300 es
precision highp float;
layout(std140) uniform Uniforms {
	vec2 uResolution;
	float uYaw;
	float uPitch;
	float uZoom;
	float uPower;
	float uTime;
	float uDetail;
	vec4 uPalA;
	vec4 uPalB;
	vec4 uPalC;
	vec4 uPalD;
${POST_GLSL_FIELDS}
};
out vec4 fragColor;
${POST_GLSL_FN}

${COLORMAP_GLSL}

vec3 palette(float t) {
	int cm = int(uPalA.w);
	if (cm > 0) { return cmap(cm, t); }
	return clamp(uPalA.xyz + uPalB.xyz * cos(6.2831853 * (uPalC.xyz * t + uPalD.xyz)), 0.0, 1.0);
}

vec2 bulbDE(vec3 pos, vec3 offset) {
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
		z = zr * vec3(sin(theta) * cos(phi), sin(theta) * sin(phi), cos(theta)) + offset;
		trap = min(trap, r);
	}
	return vec2(0.5 * log(max(r, 1e-6)) * r / dr, trap);
}

vec2 deMandelbox(vec3 p0) {
	float SCALE = 2.5;
	vec3 z = p0;
	float dr = 1.0;
	float trap = 1e10;
	for (int i = 0; i < 11; i++) {
		z = clamp(z, -1.0, 1.0) * 2.0 - z;
		float r2 = dot(z, z);
		if (r2 < 0.25) { float f = 4.0; z *= f; dr *= f; }
		else if (r2 < 1.0) { float f = 1.0 / r2; z *= f; dr *= f; }
		z = z * SCALE + p0;
		dr = dr * abs(SCALE) + 1.0;
		trap = min(trap, length(z));
	}
	return vec2(length(z) / abs(dr), trap);
}

float sdBox(vec3 p, vec3 b) {
	vec3 d = abs(p) - b;
	return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0);
}

vec2 deMenger(vec3 p0) {
	float d = sdBox(p0, vec3(1.0));
	float s = 1.0;
	for (int m = 0; m < 4; m++) {
		vec3 a = mod(p0 * s, 2.0) - 1.0;
		s *= 3.0;
		vec3 r = abs(1.0 - 3.0 * abs(a));
		float c = (min(max(r.x, r.y), min(max(r.y, r.z), max(r.z, r.x))) - 1.0) / s;
		d = max(d, c);
	}
	return vec2(d, length(p0) * 0.5);
}

vec4 qmul(vec4 a, vec4 b) {
	return vec4(
		a.x * b.x - a.y * b.y - a.z * b.z - a.w * b.w,
		a.x * b.y + a.y * b.x + a.z * b.w - a.w * b.z,
		a.x * b.z - a.y * b.w + a.z * b.x + a.w * b.y,
		a.x * b.w + a.y * b.z - a.z * b.y + a.w * b.x
	);
}

vec2 deQuat(vec3 pos) {
	vec4 c = vec4(-0.45, -0.45, 0.18, 0.3);
	vec4 z = vec4(pos, 0.0);
	vec4 dz = vec4(1.0, 0.0, 0.0, 0.0);
	float trap = 1e10;
	for (int i = 0; i < 10; i++) {
		dz = 2.0 * qmul(z, dz);
		z = qmul(z, z) + c;
		float m = dot(z, z);
		trap = min(trap, m);
		if (m > 4.0) break;
	}
	float r = length(z);
	return vec2(0.5 * r * log(max(r, 1e-6)) / max(length(dz), 1e-6), trap);
}

vec2 de(vec3 pos) {
	int shape = int(uPalD.w);
	if (shape == 1) { vec2 d = deMandelbox(pos * 2.4); return vec2(d.x / 2.4, d.y); }
	if (shape == 2) return deMenger(pos);
	if (shape == 3) return bulbDE(pos, vec3(0.4, 0.3, 0.2));
	if (shape == 4) return deQuat(pos);
	return bulbDE(pos, pos);
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
	vec2 postUv = gl_FragCoord.xy / uResolution;
	vec2 warped = ffWarp(vec2(
		(gl_FragCoord.x - 0.5 * uResolution.x) / uResolution.y,
		(gl_FragCoord.y - 0.5 * uResolution.y) / uResolution.y
	));
	float uvx = warped.x;
	float uvy = warped.y;

	float cp = cos(uPitch);
	float sp = sin(uPitch);
	float cy = cos(uYaw);
	float sy = sin(uYaw);
	vec3 ro = 2.8 * vec3(cp * sy, sp, cp * cy);
	vec3 forward = normalize(-ro);
	vec3 right = normalize(cross(forward, vec3(0.0, 1.0, 0.0)));
	vec3 up = cross(right, forward);
	float fov = 1.2 * uZoom;
	vec3 rd = normalize(forward + uvx * fov * right + uvy * fov * up);

	float t = 0.0;
	bool hit = false;
	float trap = 1.0;
	int maxSteps = int(clamp(uDetail, 60.0, 200.0));
	for (int i = 0; i < maxSteps; i++) {
		vec3 pos = ro + rd * t;
		vec2 res = de(pos);
		if (res.x < max(0.0015 * uZoom * t, 1e-6)) { hit = true; trap = res.y; break; }
		t += res.x;
		if (t > 8.0) break;
	}

	if (!hit) {
		vec3 bg = mix(vec3(0.02, 0.02, 0.03), vec3(0.05, 0.06, 0.09), uvy + 0.5);
		fragColor = ffPost(vec4(bg, 1.0), postUv);
		return;
	}

	vec3 pos = ro + rd * t;
	vec3 n = normalAt(pos);
	vec3 lightDir = normalize(vec3(0.6, 0.7, 0.4));
	float diff = max(dot(n, lightDir), 0.0);
	float amb = 0.25 + 0.2 * (0.5 + 0.5 * n.y);
	vec3 col = palette(fract(trap * 1.5 + 0.5)) * (amb + 0.85 * diff);
	fragColor = ffPost(vec4(col, 1.0), postUv);
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
		const { coeffs: c, colormap } = resolvePalette(scene);
		f(32, c.a[0]);
		f(44, colormap); // palA.w: scientific-colormap code
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
		f(92, SHAPE_CODE[scene.geometricShape ?? 'mandelbulb']); // palD.w: shape
		packPost(view, POST_BASE, scene.post);
	}
};
