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
 * Uniform layout (std140-compatible, 144 bytes before the post block):
 *   0   resolution : vec2f      24  time        : f32
 *   8   center     : vec2f      28  formula     : f32
 *   16  scale      : f32        32  seed        : vec2f
 *   20  maxIter    : f32        40  orbitLength : f32   44 pad : f32
 *   48  palA  64 palB  80 palC  96 palD : vec4f
 *   112 series0 : vec4f  (A1.x, A1.y, A2.x, A2.y)
 *   128 series1 : vec4f  (A3.x, A3.y, seriesSkip, pad)
 */
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL, COLORMAP_GLSL } from '$lib/fractals/colormaps';
import {
	DEFAULT_POST,
	POST_SIZE,
	packPost,
	POST_WGSL_FIELDS,
	POST_WGSL_FN,
	POST_GLSL_FIELDS,
	POST_GLSL_FN
} from '$lib/fractals/post';
import { FORMULA_CODES, DEFAULT_POWER } from './reference';
import {
	computeReferenceOrbitDD,
	computeSeriesApprox,
	ZERO_SERIES,
	type ReferenceOrbit,
	type SeriesApprox
} from './perturbation';
import type { FormulaId, FractalRenderer, RenderInput, SceneState } from '$lib/engine/types';

export const DEEP_ZOOM_2D_ID = 'deep-zoom-2d';
const POST_BASE = 144;
export const UNIFORM_SIZE = POST_BASE + POST_SIZE;

// Headroom for deep zoom: escape times climb with depth, so the reference orbit
// (and the per-pixel iteration cap) need to run far longer than the shallow view.
const MAX_ITER_CAP = 8000;
const MAX_ORBIT = MAX_ITER_CAP + 1;
const DATA_BUFFER_SIZE = MAX_ORBIT * 2 * 4;

/**
 * Iteration floor that grows with zoom depth so deep views resolve without the
 * user manually cranking the slider (escape times climb as you zoom in). It's 0
 * until ~300× — there the manual setting rules and shallow renders are unchanged
 * — then climbs ~400 iterations per decade of magnification, capped at the orbit
 * limit. Deep-Zoom 2D only (the other styles read maxIter as exposure, not iters).
 */
export function autoMaxIter(scale: number, baseScale = 3): number {
	const zoom = baseScale / Math.max(scale, 1e-300);
	const floor = Math.round(400 * (Math.log10(zoom) - 2.5));
	return Math.max(0, Math.min(MAX_ITER_CAP, floor));
}

/** The manual iteration count, floored by the zoom curve and capped. */
export function effectiveMaxIter(scene: SceneState): number {
	return Math.min(MAX_ITER_CAP, Math.max(scene.maxIter, autoMaxIter(scene.camera.scale)));
}

export function createDefaultScene(): SceneState {
	return {
		formula: 'mandelbrot',
		camera: { centerX: -0.5, centerY: 0, scale: 3 },
		maxIter: 300,
		paletteIndex: 0,
		juliaSeed: { x: -0.8, y: 0.156 },
		attractor: 'clifford',
		flame: 'sierpinski',
		ifs: 'barnsley-fern',
		post: { ...DEFAULT_POST }
	};
}

/** Largest |δc| in the view — a frame corner, the worst case for series validity. */
function viewMaxRadius(input: RenderInput): number {
	const perPixel = input.scene.camera.scale / input.height;
	return Math.hypot((input.width / 2) * perPixel, (input.height / 2) * perPixel);
}

// Memo so packUniforms and packData share one computation per frame (both run
// with the same input each frame). The reference orbit and the series skip are
// keyed separately on purpose: the orbit depends only on centre/seed/iter, but
// the series skip also depends on the view `radius`, which changes every frame
// while zooming. Folding radius into one key would re-run the expensive
// double-double orbit on every zoom frame; splitting lets a pure-radius change
// recompute only the (cheap) series and reuse the orbit.
let memoOrbitKey = '';
let memoOrbit: ReferenceOrbit = { xs: new Float64Array(0), ys: new Float64Array(0), length: 0 };
let memoData = new Float32Array(2);
let memoSeriesKey = '';
let memoSeries: SeriesApprox = ZERO_SERIES;

// Only these formulas reach the shader's perturbation fall-through and read the
// reference orbit/series. The rest (abs-variants, Multibrot, Newton, Phoenix,
// Lyapunov, Apollonian) iterate directly in the shader. Burning Ship iterates
// directly while shallow but still uses the orbit once deep, so it stays in.
const PERTURBATION_FORMULAS = new Set<FormulaId>([
	'mandelbrot',
	'julia',
	'burning-ship',
	'tricorn'
]);
// A non-empty placeholder: signals "no orbit" via length 0 while keeping the
// WebGL2 orbit-texture upload valid (it needs ≥ 1 texel).
const NO_ORBIT = new Float32Array(2);

function orbitFor(input: RenderInput): {
	data: Float32Array;
	length: number;
	series: SeriesApprox;
} {
	const s = input.scene;
	// Skip the (double-double) orbit computation and its per-frame GPU upload for
	// formulas the shader iterates directly — they never read it.
	if (!PERTURBATION_FORMULAS.has(s.formula)) {
		return { data: NO_ORBIT, length: 0, series: ZERO_SERIES };
	}
	const cam = s.camera;
	const iter = effectiveMaxIter(s);
	const orbitKey = `${s.formula}|${cam.centerX}|${cam.centerXLo ?? 0}|${cam.centerY}|${cam.centerYLo ?? 0}|${s.juliaSeed.x}|${s.juliaSeed.y}|${iter}`;
	if (orbitKey !== memoOrbitKey) {
		const orbit = computeReferenceOrbitDD(
			s.formula,
			{ hi: cam.centerX, lo: cam.centerXLo ?? 0 },
			{ hi: cam.centerY, lo: cam.centerYLo ?? 0 },
			s.juliaSeed.x,
			s.juliaSeed.y,
			iter
		);
		const data = new Float32Array(orbit.length * 2);
		for (let i = 0; i < orbit.length; i++) {
			data[i * 2] = orbit.xs[i];
			data[i * 2 + 1] = orbit.ys[i];
		}
		memoOrbitKey = orbitKey;
		memoOrbit = orbit;
		memoData = data;
	}
	const radius = viewMaxRadius(input);
	const seriesKey = `${orbitKey}|${radius}`;
	if (seriesKey !== memoSeriesKey) {
		memoSeries = computeSeriesApprox(s.formula, memoOrbit, radius, iter);
		memoSeriesKey = seriesKey;
	}
	return { data: memoData, length: memoOrbit.length, series: memoSeries };
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
	power: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
	series0: vec4f,
	series1: vec4f,
${POST_WGSL_FIELDS}
};
@group(0) @binding(0) var<uniform> u: Uniforms;
@group(0) @binding(1) var<storage, read> orbit: array<vec2f>;
${POST_WGSL_FN}

fn cmul(a: vec2f, b: vec2f) -> vec2f {
	return vec2f(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

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

fn color(n: f32, z: vec2f) -> vec4f {
	let logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	let nu = log(logZn / 0.6931472) / 0.6931472;
	return vec4f(palette(fract((n + 1.0 - nu) * 0.02)), 1.0);
}

const INTERIOR = vec4f(0.02, 0.02, 0.03, 1.0);

// Newton basin coloring: each of the three roots takes a third of the palette,
// shaded by how fast the orbit converged (faster = brighter band).
fn newtonColor(root: i32, iter: i32) -> vec4f {
	if (root < 0) { return INTERIOR; }
	let t = fract(f32(root) / 3.0 + f32(iter) * 0.035);
	let shade = clamp(1.0 - f32(iter) * 0.02, 0.25, 1.0);
	return vec4f(palette(t) * shade, 1.0);
}

// Lyapunov coloring: ordered regimes (λ<0) take the palette, brighter the more
// stable; chaotic regimes (λ>0) fall to near-black so the ordered "swallows"
// read as luminous structure on a dark field.
fn lyapunovColor(lam: f32) -> vec4f {
	if (lam < 0.0) {
		let t = clamp(sqrt(-lam) * 0.9, 0.0, 1.0);
		return vec4f(palette(t), 1.0);
	}
	let v = clamp(lam * 1.5, 0.0, 1.0);
	return vec4f(INTERIOR.rgb + vec3f(0.0, 0.015, 0.04) * v, 1.0);
}

// Apollonian coloring: the orbit-trap pseudo-distance is small along the circle
// net, so glow = 1/(1+k·de) lights the packing; the palette tints it.
fn apollonianColor(de: f32) -> vec4f {
	let glow = 1.0 / (1.0 + de * 26.0);
	return vec4f(palette(fract(glow)) * glow, 1.0);
}

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

	// Newton fractal (z³ − 1): root-basin coloring, not escape-time. z starts at
	// the pixel and follows Newton's method until it lands in a root's basin.
	if (formula == 10) {
		var zz = u.center + offset;
		var root = -1;
		var iter = 0;
		loop {
			if (iter >= maxI) { break; }
			let z2 = cmul(zz, zz);
			let f = cmul(z2, zz) - vec2f(1.0, 0.0); // z³ − 1
			let fp = 3.0 * z2;                       // 3z²
			let d = fp.x * fp.x + fp.y * fp.y + 1e-12;
			let q = vec2f((f.x * fp.x + f.y * fp.y) / d, (f.y * fp.x - f.x * fp.y) / d);
			zz = zz - q;
			let d0 = zz - vec2f(1.0, 0.0);
			let d1 = zz - vec2f(-0.5, 0.8660254);
			let d2 = zz - vec2f(-0.5, -0.8660254);
			if (dot(d0, d0) < 1e-6) { root = 0; break; }
			if (dot(d1, d1) < 1e-6) { root = 1; break; }
			if (dot(d2, d2) < 1e-6) { root = 2; break; }
			iter = iter + 1;
		}
		return ffPost(newtonColor(root, iter), uv);
	}

	// Phoenix: escape-time with a previous-z coupling term. z₀ = pixel, z₋₁ = 0,
	// real constant c = seed.x and real coupling p = seed.y.
	if (formula == 11) {
		var z = u.center + offset;
		var zp = vec2f(0.0, 0.0);
		var i = 0;
		loop {
			if (i >= maxI) { break; }
			if (z.x * z.x + z.y * z.y > 65536.0) { return ffPost(color(f32(i), z), uv); }
			let zn = vec2f(
				z.x * z.x - z.y * z.y + u.seed.x + u.seed.y * zp.x,
				2.0 * z.x * z.y + u.seed.y * zp.y
			);
			zp = z;
			z = zn;
			i = i + 1;
		}
		return ffPost(INTERIOR, uv);
	}

	// Lyapunov (Markus) fractal: the world point is a pair of logistic growth
	// rates (a, b) = center + offset. Iterate x ← r·x·(1−x) with r alternating
	// a, b (the "AB" sequence), warm up, then average ln|r·(1−2x)| → λ. Mirrors
	// lyapunovExponent in reference.ts (critical-point seed x₀ = 0.5).
	if (formula == 12) {
		let ab = u.center + offset;
		var x = 0.5;
		for (var k = 0; k < 100; k = k + 1) {
			let r = select(ab.y, ab.x, (k & 1) == 0); // even → a, odd → b
			x = r * x * (1.0 - x);
		}
		let n = max(1, min(maxI, 500)); // guard λ = sum/n against maxIter == 0
		var sum = 0.0;
		for (var k = 0; k < n; k = k + 1) {
			let r = select(ab.y, ab.x, (k & 1) == 0); // warmup ended on an even count
			x = r * x * (1.0 - x);
			sum = sum + log(max(1e-12, abs(r * (1.0 - 2.0 * x))));
		}
		return ffPost(lyapunovColor(sum / f32(n)), uv);
	}

	// Apollonian gasket net: fold the point into the [-1,1] cell (a lattice of
	// tangent circles) and invert it in the unit circle, tracking the scale; the
	// orbit-trap |p|/scale reads the recursive packing. Mirrors apollonianValue
	// (APOLLONIAN_C = 1.1).
	if (formula == 13) {
		var p = u.center + offset;
		var sc = 1.0;
		let iters = min(maxI, 24);
		for (var k = 0; k < iters; k = k + 1) {
			p = p - 2.0 * round(p * 0.5);
			let r2 = max(dot(p, p), 1e-6);
			let kk = 1.1 / r2;
			p = p * kk;
			sc = sc * kk;
		}
		return ffPost(apollonianColor(length(p) / sc), uv);
	}

	// Direct f32 iteration. Burning Ship's sign-form perturbation glitches when the
	// per-pixel delta is large (zoomed out), so iterate it directly until deep enough
	// that direct f32 would itself break down (~scale 0.002 ≈ 1500×); below that, fall
	// through to perturbation. The abs-variant formulas (codes 4–9) have no
	// perturbation path yet, so they always iterate directly (f32 depth limit applies).
	if ((formula == 2 && u.scale > 0.002) || (formula >= 4 && formula <= 9)) {
		let c = u.center + offset;
		var z = vec2f(0.0, 0.0);
		var i = 0;
		loop {
			if (i >= maxI) { break; }
			let x2 = z.x * z.x;
			let y2 = z.y * z.y;
			if (x2 + y2 > 65536.0) { return ffPost(color(f32(i), z), uv); }
			if (formula == 2) {
				let ax = abs(z.x);
				let ay = abs(z.y);
				z = vec2f(ax * ax - ay * ay + c.x, 2.0 * ax * ay + c.y);
			} else if (formula == 4) {        // celtic
				z = vec2f(abs(x2 - y2) + c.x, 2.0 * z.x * z.y + c.y);
			} else if (formula == 5) {        // buffalo
				z = vec2f(abs(x2 - y2) + c.x, 2.0 * abs(z.x * z.y) + c.y);
			} else if (formula == 6) {        // perpendicular
				z = vec2f(x2 - y2 + c.x, 2.0 * abs(z.x) * z.y + c.y);
			} else if (formula == 7) {        // perpendicular-ship
				z = vec2f(x2 - y2 + c.x, 2.0 * z.x * abs(z.y) + c.y);
			} else if (formula == 8) {        // celtic-mandelbar
				z = vec2f(abs(x2 - y2) + c.x, -2.0 * z.x * z.y + c.y);
			} else {                          // multibrot (9): zᵈ + c (polar)
				let r = pow(x2 + y2, u.power * 0.5);
				let theta = atan2(z.y, z.x) * u.power;
				z = vec2f(r * cos(theta) + c.x, r * sin(theta) + c.y);
			}
			i = i + 1;
		}
		return ffPost(INTERIOR, uv);
	}

	// Perturbation + rebasing for every formula. Shared increment w = 2·Z·δ + δ²;
	// the per-formula assembly mirrors perturbation.ts. Julia threads the
	// perturbation through the initial delta (no per-step δc); the rest start at 0.
	let lim = i32(u.orbitLength);
	let z0 = orbit[0];
	// Series approximation (Mandelbrot/Julia): when skip > 0, jump straight to
	// iteration N=skip with dz = A1*dc + A2*dc^2 + A3*dc^3 instead of iterating the
	// early, well-approximated steps. skip == 0 means iterate from 0 as before.
	let skip = i32(u.series1.z);
	var dz = select(vec2f(0.0, 0.0), offset, formula == 1);
	var refIdx = 0;
	var iter = 0;
	if (skip > 0) {
		let dc2 = cmul(offset, offset);
		let dc3 = cmul(dc2, offset);
		dz = cmul(u.series0.xy, offset) + cmul(u.series0.zw, dc2) + cmul(u.series1.xy, dc3);
		refIdx = skip;
		iter = skip;
	}
	loop {
		if (iter >= maxI) { break; }
		let Z = orbit[refIdx];
		let w = vec2f(
			2.0 * (Z.x * dz.x - Z.y * dz.y) + (dz.x * dz.x - dz.y * dz.y),
			2.0 * (Z.x * dz.y + Z.y * dz.x) + 2.0 * dz.x * dz.y
		);
		if (formula == 1) {
			dz = w;
		} else if (formula == 3) {
			dz = vec2f(w.x + offset.x, -w.y + offset.y);
		} else if (formula == 2) {
			let s = sign(Z.x) * sign(Z.y);
			dz = vec2f(w.x + offset.x, s * w.y + offset.y);
		} else {
			dz = w + offset;
		}
		refIdx = refIdx + 1;
		let z = orbit[refIdx] + dz;
		let zmag = z.x * z.x + z.y * z.y;
		if (zmag > 65536.0) { return ffPost(color(f32(iter + 1), z), uv); }
		if (zmag < dz.x * dz.x + dz.y * dz.y || refIdx >= lim - 1) {
			dz = z - z0;
			refIdx = 0;
		}
		iter = iter + 1;
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
	float uPower;
	vec4 uPalA;
	vec4 uPalB;
	vec4 uPalC;
	vec4 uPalD;
	vec4 uSeries0;
	vec4 uSeries1;
${POST_GLSL_FIELDS}
};
uniform highp sampler2D uOrbit;
out vec4 fragColor;
${POST_GLSL_FN}

vec2 cmul(vec2 a, vec2 b) {
	return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

${COLORMAP_GLSL}

vec3 palette(float t) {
	int cm = int(uPalA.w);
	if (cm > 0) { return cmap(cm, t); }
	return clamp(uPalA.xyz + uPalB.xyz * cos(6.2831853 * (uPalC.xyz * t + uPalD.xyz)), 0.0, 1.0);
}

vec4 colorOf(float n, vec2 z) {
	float logZn = log(z.x * z.x + z.y * z.y) * 0.5;
	float nu = log(logZn / 0.6931472) / 0.6931472;
	return vec4(palette(fract((n + 1.0 - nu) * 0.02)), 1.0);
}

const vec4 INTERIOR = vec4(0.02, 0.02, 0.03, 1.0);

vec4 newtonColor(int root, int iter) {
	if (root < 0) return INTERIOR;
	float t = fract(float(root) / 3.0 + float(iter) * 0.035);
	float shade = clamp(1.0 - float(iter) * 0.02, 0.25, 1.0);
	return vec4(palette(t) * shade, 1.0);
}

vec4 lyapunovColor(float lam) {
	if (lam < 0.0) {
		float t = clamp(sqrt(-lam) * 0.9, 0.0, 1.0);
		return vec4(palette(t), 1.0);
	}
	float v = clamp(lam * 1.5, 0.0, 1.0);
	return vec4(INTERIOR.rgb + vec3(0.0, 0.015, 0.04) * v, 1.0);
}

vec4 apollonianColor(float de) {
	float glow = 1.0 / (1.0 + de * 26.0);
	return vec4(palette(fract(glow)) * glow, 1.0);
}

void main() {
	vec2 uv = gl_FragCoord.xy / uResolution;
	float perPixel = uScale / uResolution.y;
	vec2 offset = ffWarp(vec2(
		(gl_FragCoord.x - uResolution.x * 0.5) * perPixel,
		(gl_FragCoord.y - uResolution.y * 0.5) * perPixel
	));
	int formula = int(uFormula);
	int maxI = int(uMaxIter);

	// Newton fractal (z³ − 1): root-basin coloring, not escape-time.
	if (formula == 10) {
		vec2 zz = uCenter + offset;
		int root = -1;
		int iter = 0;
		for (int k = 0; k < maxI; k++) {
			vec2 z2 = cmul(zz, zz);
			vec2 f = cmul(z2, zz) - vec2(1.0, 0.0);
			vec2 fp = 3.0 * z2;
			float d = fp.x * fp.x + fp.y * fp.y + 1e-12;
			vec2 q = vec2((f.x * fp.x + f.y * fp.y) / d, (f.y * fp.x - f.x * fp.y) / d);
			zz = zz - q;
			vec2 d0 = zz - vec2(1.0, 0.0);
			vec2 d1 = zz - vec2(-0.5, 0.8660254);
			vec2 d2 = zz - vec2(-0.5, -0.8660254);
			if (dot(d0, d0) < 1e-6) { root = 0; iter = k; break; }
			if (dot(d1, d1) < 1e-6) { root = 1; iter = k; break; }
			if (dot(d2, d2) < 1e-6) { root = 2; iter = k; break; }
			iter = k;
		}
		fragColor = ffPost(newtonColor(root, iter), uv);
		return;
	}

	// Phoenix: escape-time with a previous-z coupling term (c = seed.x, p = seed.y).
	if (formula == 11) {
		vec2 z = uCenter + offset;
		vec2 zp = vec2(0.0);
		for (int i = 0; i < maxI; i++) {
			if (z.x * z.x + z.y * z.y > 65536.0) { fragColor = ffPost(colorOf(float(i), z), uv); return; }
			vec2 zn = vec2(
				z.x * z.x - z.y * z.y + uSeed.x + uSeed.y * zp.x,
				2.0 * z.x * z.y + uSeed.y * zp.y
			);
			zp = z;
			z = zn;
		}
		fragColor = ffPost(INTERIOR, uv);
		return;
	}

	// Lyapunov (Markus) fractal: (a, b) = the world point; iterate the logistic
	// map with the alternating AB sequence and read the Lyapunov exponent λ.
	// Mirrors lyapunovExponent in reference.ts (critical-point seed x₀ = 0.5).
	if (formula == 12) {
		vec2 ab = uCenter + offset;
		float x = 0.5;
		for (int k = 0; k < 100; k++) {
			float r = (k & 1) == 0 ? ab.x : ab.y;
			x = r * x * (1.0 - x);
		}
		int n = max(1, min(maxI, 500)); // guard λ = sum/n against maxIter == 0
		float sum = 0.0;
		for (int k = 0; k < n; k++) {
			float r = (k & 1) == 0 ? ab.x : ab.y;
			x = r * x * (1.0 - x);
			sum += log(max(1e-12, abs(r * (1.0 - 2.0 * x))));
		}
		fragColor = ffPost(lyapunovColor(sum / float(n)), uv);
		return;
	}

	// Apollonian gasket net: fold into the [-1,1] cell and circle-invert, tracking
	// scale; |p|/scale is the orbit-trap distance. Mirrors apollonianValue (C = 1.1).
	if (formula == 13) {
		vec2 p = uCenter + offset;
		float sc = 1.0;
		int iters = min(maxI, 24);
		for (int k = 0; k < iters; k++) {
			p = p - 2.0 * round(p * 0.5);
			float r2 = max(dot(p, p), 1e-6);
			float kk = 1.1 / r2;
			p *= kk;
			sc *= kk;
		}
		fragColor = ffPost(apollonianColor(length(p) / sc), uv);
		return;
	}

	// Direct f32 iteration: Burning Ship while shallow (its sign-form perturbation
	// glitches when the per-pixel delta is large), and the abs-variant formulas
	// (codes 4–9) which have no perturbation path yet. Perturbation once deep.
	if ((formula == 2 && uScale > 0.002) || (formula >= 4 && formula <= 9)) {
		vec2 c = uCenter + offset;
		vec2 z = vec2(0.0);
		for (int i = 0; i < maxI; i++) {
			float x2 = z.x * z.x;
			float y2 = z.y * z.y;
			if (x2 + y2 > 65536.0) { fragColor = ffPost(colorOf(float(i), z), uv); return; }
			if (formula == 2) {
				float ax = abs(z.x);
				float ay = abs(z.y);
				z = vec2(ax * ax - ay * ay + c.x, 2.0 * ax * ay + c.y);
			} else if (formula == 4) {        // celtic
				z = vec2(abs(x2 - y2) + c.x, 2.0 * z.x * z.y + c.y);
			} else if (formula == 5) {        // buffalo
				z = vec2(abs(x2 - y2) + c.x, 2.0 * abs(z.x * z.y) + c.y);
			} else if (formula == 6) {        // perpendicular
				z = vec2(x2 - y2 + c.x, 2.0 * abs(z.x) * z.y + c.y);
			} else if (formula == 7) {        // perpendicular-ship
				z = vec2(x2 - y2 + c.x, 2.0 * z.x * abs(z.y) + c.y);
			} else if (formula == 8) {        // celtic-mandelbar
				z = vec2(abs(x2 - y2) + c.x, -2.0 * z.x * z.y + c.y);
			} else {                          // multibrot (9): zᵈ + c (polar)
				float r = pow(x2 + y2, uPower * 0.5);
				float theta = atan(z.y, z.x) * uPower; // GLSL atan(y,x) == atan2
				z = vec2(r * cos(theta) + c.x, r * sin(theta) + c.y);
			}
		}
		fragColor = ffPost(INTERIOR, uv);
		return;
	}

	// Perturbation + rebasing for every formula (mirrors the WGSL + perturbation.ts).
	int lim = int(uOrbitLength);
	vec2 z0 = texelFetch(uOrbit, ivec2(0, 0), 0).rg;
	// Series approximation (Mandelbrot/Julia): skip > 0 jumps to iteration N=skip
	// with dz = A1*dc + A2*dc^2 + A3*dc^3; skip == 0 iterates from 0 as before.
	int skip = int(uSeries1.z);
	vec2 dz = formula == 1 ? offset : vec2(0.0);
	int refIdx = 0;
	int iterStart = 0;
	if (skip > 0) {
		vec2 dc2 = cmul(offset, offset);
		vec2 dc3 = cmul(dc2, offset);
		dz = cmul(uSeries0.xy, offset) + cmul(uSeries0.zw, dc2) + cmul(uSeries1.xy, dc3);
		refIdx = skip;
		iterStart = skip;
	}
	for (int iter = iterStart; iter < maxI; iter++) {
		vec2 Z = texelFetch(uOrbit, ivec2(refIdx, 0), 0).rg;
		vec2 w = vec2(
			2.0 * (Z.x * dz.x - Z.y * dz.y) + (dz.x * dz.x - dz.y * dz.y),
			2.0 * (Z.x * dz.y + Z.y * dz.x) + 2.0 * dz.x * dz.y
		);
		if (formula == 1) {
			dz = w;
		} else if (formula == 3) {
			dz = vec2(w.x + offset.x, -w.y + offset.y);
		} else if (formula == 2) {
			float s = sign(Z.x) * sign(Z.y);
			dz = vec2(w.x + offset.x, s * w.y + offset.y);
		} else {
			dz = w + offset;
		}
		refIdx += 1;
		vec2 z = texelFetch(uOrbit, ivec2(refIdx, 0), 0).rg + dz;
		float zmag = z.x * z.x + z.y * z.y;
		if (zmag > 65536.0) { fragColor = ffPost(colorOf(float(iter + 1), z), uv); return; }
		if (zmag < dz.x * dz.x + dz.y * dz.y || refIdx >= lim - 1) {
			dz = z - z0;
			refIdx = 0;
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
		f(20, effectiveMaxIter(scene));
		f(24, timeMs);
		f(28, FORMULA_CODES[scene.formula]);
		f(32, scene.juliaSeed.x);
		f(36, scene.juliaSeed.y);
		f(40, orbitFor(input).length);
		f(44, scene.power ?? DEFAULT_POWER); // Multibrot exponent (former pad slot)
		const { coeffs: c, colormap } = resolvePalette(scene);
		f(48, c.a[0]);
		f(52, c.a[1]);
		f(56, c.a[2]);
		f(60, colormap); // palA.w: scientific-colormap code (0 = cosine/custom)
		f(64, c.b[0]);
		f(68, c.b[1]);
		f(72, c.b[2]);
		f(80, c.c[0]);
		f(84, c.c[1]);
		f(88, c.c[2]);
		f(96, c.d[0]);
		f(100, c.d[1]);
		f(104, c.d[2]);
		// series0 = (A1.x, A1.y, A2.x, A2.y), series1 = (A3.x, A3.y, skip, pad).
		const series = orbitFor(input).series;
		f(112, series.a1x);
		f(116, series.a1y);
		f(120, series.a2x);
		f(124, series.a2y);
		f(128, series.a3x);
		f(132, series.a3y);
		f(136, series.skip);
		f(140, 0);
		packPost(view, POST_BASE, scene.post);
	}
};
