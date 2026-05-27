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
import {
	computeReferenceOrbitDD,
	computeSeriesApprox,
	ZERO_SERIES,
	type ReferenceOrbit,
	type SeriesApprox
} from './perturbation';
import type { FractalRenderer, RenderInput, SceneState } from '$lib/engine/types';

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

function orbitFor(input: RenderInput): {
	data: Float32Array;
	length: number;
	series: SeriesApprox;
} {
	const s = input.scene;
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
	pad0: f32,
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

	// Direct f32 iteration. Burning Ship's sign-form perturbation glitches when the
	// per-pixel delta is large (zoomed out), so iterate it directly until deep enough
	// that direct f32 would itself break down (~scale 0.002 ≈ 1500×); below that, fall
	// through to perturbation. The abs-variant formulas (codes ≥ 4) have no
	// perturbation path yet, so they always iterate directly (f32 depth limit applies).
	if ((formula == 2 && u.scale > 0.002) || formula >= 4) {
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
			} else {                          // celtic-mandelbar (8)
				z = vec2f(abs(x2 - y2) + c.x, -2.0 * z.x * z.y + c.y);
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
	float uPad0;
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

	// Direct f32 iteration: Burning Ship while shallow (its sign-form perturbation
	// glitches when the per-pixel delta is large), and the abs-variant formulas
	// (codes >= 4) which have no perturbation path yet. Perturbation once deep.
	if ((formula == 2 && uScale > 0.002) || formula >= 4) {
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
			} else {                          // celtic-mandelbar (8)
				z = vec2(abs(x2 - y2) + c.x, -2.0 * z.x * z.y + c.y);
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
