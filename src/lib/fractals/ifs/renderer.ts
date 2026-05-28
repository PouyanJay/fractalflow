/**
 * IFS renderer — a WebGPU compute chaos-game engine for iterated function
 * systems (Barnsley fern, Sierpiński, Heighway dragon, Koch / Lévy curves).
 * Each particle runs the chaos game over the selected system's weighted affine
 * maps and plots its orbit, accumulating two channels per pixel: density (hit
 * count) and a colour sum. The fragment pass colours each pixel by its average
 * colour coordinate and sets brightness from log-density — so the attractor
 * glows out of black. WebGPU-only (no WebGL2 path).
 *
 * The per-system map / colour / weighted-picker WGSL is code-generated from the
 * CPU IFS_SYSTEMS table in ifs.ts, so the GPU chaos game provably mirrors the
 * reference (no hand-transcribed affine coefficients, identical weights). Reuses
 * the shared Scene: camera is 2D pan/zoom, maxIter = exposure, paletteIndex =
 * palette, ifs = which system.
 *
 * Uniform layout (std140-compatible, 112 bytes before the post block):
 *   0  resolution : vec2f
 *   8  system : u32     12 steps : u32
 *   16 centerX : f32  20 centerY : f32  24 scale : f32  28 exposure : f32
 *   32 cx : f32  36 cy : f32  40 radius : f32  44 depth : f32
 *   48 palA  64 palB  80 palC  96 palD : vec4f
 *
 * `depth` < 0 renders the fully-formed dense chaos game; depth ≥ 0 renders the
 * depth-d Formation approximation (a solid frame growing into the attractor).
 */
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL } from '$lib/fractals/colormaps';
import { POST_SIZE, packPost, POST_WGSL_FIELDS, POST_WGSL_FN } from '$lib/fractals/post';
import {
	IFS_SYSTEMS,
	ifsFraming,
	formationMaxDepth,
	ifsHull,
	polygonCentroid,
	HULL_MAX,
	HULL_SEED_TRIES,
	type IFSFraming,
	type Pt
} from './ifs';
import type { ComputeRenderer, RenderInput } from '$lib/engine/types';

export const IFS_ID = 'ifs';
// The Formation seed-hull sits between the palette and post blocks: HULL_MAX
// points packed 2-per-vec4f, then a meta vec4f (centroid.xy, hullCount in .z).
const HULL_VEC4S = HULL_MAX / 2;
const HULL_BASE = 112;
const META_BASE = HULL_BASE + HULL_VEC4S * 16;
const POST_BASE = META_BASE + 16;
const UNIFORM_SIZE = POST_BASE + POST_SIZE;
const PARTICLE_COUNT = 1 << 16;
const STEPS_PER_PARTICLE = 256;
// Colour coord in [0,1] → fixed-point u32 for atomic accumulation (mirrors flames).
const COLOR_FIXED = 1024;
const EXPOSURE_SCALE = 4.5e-4; // maxIter (50–1200) → log-density gain
const TRANSIENT = 30;
// Depth sentinel: a negative `depth` uniform means "fully formed" → the dense
// chaos game. A Formation journey ramps depth 0→maxDepth as it grows in.
const FORMED = -1;

const SYSTEM_INDEX: Record<string, number> = Object.fromEntries(
	IFS_SYSTEMS.map((s, i) => [s.id, i])
);

// Framing, Formation depth and the seed-hull are derived from the (expensive)
// reference chaos game, so precompute them once per system, not every frame.
const FRAMINGS: Record<string, IFSFraming> = Object.fromEntries(
	IFS_SYSTEMS.map((s) => [s.id, ifsFraming(s)])
);
const MAX_DEPTH: Record<string, number> = Object.fromEntries(
	IFS_SYSTEMS.map((s) => [s.id, formationMaxDepth(s)])
);
interface SeedHull {
	verts: Pt[];
	centroid: Pt;
}
const HULLS: Record<string, SeedHull> = Object.fromEntries(
	IFS_SYSTEMS.map((s) => {
		const verts = ifsHull(s);
		return [s.id, { verts, centroid: polygonCentroid(verts) }];
	})
);

// WGSL float literal that always carries a decimal point.
const lit = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Code-generate the per-system step / colour / weighted-picker switches. */
function generateIfsWgsl(): string {
	const stepCases = IFS_SYSTEMS.map((s, si) => {
		const ks = s.maps
			.map((m, ki) => {
				const [a, b, c, d, e, g] = m.affine;
				const x = `${lit(a)} * p.x + ${lit(b)} * p.y + ${lit(c)}`;
				const y = `${lit(d)} * p.x + ${lit(e)} * p.y + ${lit(g)}`;
				return `\t\t\tcase ${ki}u: { return vec2f(${x}, ${y}); }`;
			})
			.join('\n');
		return `\t\tcase ${si}u: {\n\t\t\tswitch k {\n${ks}\n\t\t\tdefault: {}\n\t\t\t}\n\t\t}`;
	}).join('\n');

	const colorCases = IFS_SYSTEMS.map((s, si) => {
		const ks = s.maps.map((m, ki) => `\t\t\tcase ${ki}u: { return ${lit(m.color)}; }`).join('\n');
		return `\t\tcase ${si}u: {\n\t\t\tswitch k {\n${ks}\n\t\t\tdefault: {}\n\t\t\t}\n\t\t}`;
	}).join('\n');

	// Weighted selection: compare a uniform r∈[0,1) against the normalised
	// cumulative weights. The fern's lopsided probabilities ride on this.
	const pickCases = IFS_SYSTEMS.map((s, si) => {
		const total = s.maps.reduce((acc, m) => acc + m.weight, 0);
		let cum = 0;
		const tests = s.maps
			.slice(0, -1)
			.map((m, ki) => {
				cum += m.weight / total;
				return `\t\t\tif (r < ${lit(cum)}) { return ${ki}u; }`;
			})
			.join('\n');
		const last = s.maps.length - 1;
		return `\t\tcase ${si}u: {\n${tests}\n\t\t\treturn ${last}u;\n\t\t}`;
	}).join('\n');

	return `
fn ifsStep(system: u32, k: u32, p: vec2f) -> vec2f {
	switch system {
${stepCases}
	default: {}
	}
	return p;
}

fn ifsColor(system: u32, k: u32) -> f32 {
	switch system {
${colorCases}
	default: {}
	}
	return 0.0;
}

fn ifsPick(system: u32, r: f32) -> u32 {
	switch system {
${pickCases}
	default: {}
	}
	return 0u;
}`;
}

const WGSL = /* wgsl */ `
struct U {
	resolution: vec2f,
	system: u32,
	steps: u32,
	centerX: f32,
	centerY: f32,
	scale: f32,
	exposure: f32,
	cx: f32,
	cy: f32,
	radius: f32,
	depth: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
	hull: array<vec4f, ${HULL_VEC4S}>,
	meta: vec4f,
${POST_WGSL_FIELDS}
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> grid: array<atomic<u32>>;
${POST_WGSL_FN}
${generateIfsWgsl()}

fn rngNext(state: ptr<function, u32>) -> f32 {
	var s = *state;
	s = s * 747796405u + 2891336453u;
	*state = s;
	let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
	return f32((word >> 22u) ^ word) / 4294967296.0;
}

// The Formation seed-hull: HULL_MAX points packed two per vec4f (xy, zw).
fn hullPoint(j: u32) -> vec2f {
	let v = u.hull[j >> 1u];
	return select(v.zw, v.xy, (j & 1u) == 0u);
}

// Inside the attractor's CCW convex-hull silhouette (left of every edge)?
fn insideHull(p: vec2f) -> bool {
	let n = u32(u.meta.z);
	if (n < 3u) { return true; }
	for (var i = 0u; i < n; i = i + 1u) {
		let a = hullPoint(i);
		let b = hullPoint((i + 1u) % n);
		if ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x) < 0.0) { return false; }
	}
	return true;
}

fn project(p: vec2f) -> vec2f {
	let n = (p - vec2f(u.cx, u.cy)) / u.radius; // frame the attractor to ~[-1,1]
	let ppu = u.resolution.y / u.scale; // pixels per unit (scale = vertical extent)
	return vec2f(
		u.resolution.x * 0.5 + (n.x - u.centerX) * ppu,
		u.resolution.y * 0.5 - (n.y - u.centerY) * ppu
	);
}

fn plot(p: vec2f, c: f32, w: u32, h: u32) {
	let sc = project(p);
	let x = i32(floor(sc.x));
	let y = i32(floor(sc.y));
	if (x >= 0 && y >= 0 && x < i32(w) && y < i32(h)) {
		let base = (u32(y) * w + u32(x)) * 2u;
		atomicAdd(&grid[base], 1u);
		atomicAdd(&grid[base + 1u], u32(c * ${lit(COLOR_FIXED)}));
	}
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x;
	var rng = i * 747796405u + 2891336453u;
	let w = u32(u.resolution.x);
	let h = u32(u.resolution.y);

	if (u.depth < 0.0) {
		// Fully formed: the dense chaos game — skip a transient onto the attractor,
		// then plot the orbit.
		var p = vec2f(rngNext(&rng) * 0.2 - 0.1, rngNext(&rng) * 0.2 - 0.1);
		var c = rngNext(&rng);
		for (var s = 0u; s < ${TRANSIENT}u; s = s + 1u) {
			let k = ifsPick(u.system, rngNext(&rng));
			p = ifsStep(u.system, k, p);
			c = (c + ifsColor(u.system, k)) * 0.5;
		}
		for (var s = 0u; s < u.steps; s = s + 1u) {
			let k = ifsPick(u.system, rngNext(&rng));
			p = ifsStep(u.system, k, p);
			c = (c + ifsColor(u.system, k)) * 0.5;
			plot(p, c, w, h);
		}
		return;
	}

	// Forming: the depth-d Hutchinson approximation. Each plotted point is a
	// random sample of the solid framing square pushed through d random maps,
	// so at d near 0 it's the solid frame and as d grows it collapses onto the
	// attractor — the fractal grows out of one shape. A fractional depth blends
	// d and d+1 per sample for a smooth ramp.
	let d0 = u32(floor(u.depth));
	let frac = u.depth - floor(u.depth);
	let seedC = vec2f(u.cx, u.cy);
	for (var s = 0u; s < u.steps; s = s + 1u) {
		// Seed inside the attractor's hull silhouette (Sierpiński grows from a
		// triangle, not its bounding square): rejection-sample the framing square,
		// falling back to the hull centroid if every try misses.
		var p = seedC + (vec2f(rngNext(&rng), rngNext(&rng)) - vec2f(0.5)) * (2.0 * u.radius);
		var inHull = insideHull(p);
		for (var k = 1u; !inHull && k < ${HULL_SEED_TRIES}u; k = k + 1u) {
			p = seedC + (vec2f(rngNext(&rng), rngNext(&rng)) - vec2f(0.5)) * (2.0 * u.radius);
			inHull = insideHull(p);
		}
		if (!inHull) { p = u.meta.xy; }
		var c = 0.5;
		var d = d0;
		if (rngNext(&rng) < frac) { d = d + 1u; }
		for (var k = 0u; k < d; k = k + 1u) {
			let mi = ifsPick(u.system, rngNext(&rng));
			p = ifsStep(u.system, mi, p);
			c = (c + ifsColor(u.system, mi)) * 0.5;
		}
		plot(p, c, w, h);
	}
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let q = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(q * 2.0 - 1.0, 0.0, 1.0);
}

${COLORMAP_WGSL}

fn pal(t: f32) -> vec3f {
	let cm = i32(u.palA.w);
	if (cm > 0) { return cmap(cm, t); }
	return u.palA.rgb + u.palB.rgb * cos(6.28318530718 * (u.palC.rgb * t + u.palD.rgb));
}

@fragment
fn fs(@builtin(position) pos: vec4f) -> @location(0) vec4f {
	let postUv = pos.xy / u.resolution;
	let wp = ffWarp(pos.xy - u.resolution * 0.5) + u.resolution * 0.5;
	let px = i32(floor(wp.x));
	let py = i32(floor(wp.y));
	if (px < 0 || py < 0 || px >= i32(u.resolution.x) || py >= i32(u.resolution.y)) {
		return ffPost(vec4f(0.0, 0.0, 0.0, 1.0), postUv);
	}
	let base = (u32(py) * u32(u.resolution.x) + u32(px)) * 2u;
	if (base + 1u >= arrayLength(&grid)) { return ffPost(vec4f(0.0, 0.0, 0.0, 1.0), postUv); }
	let d = f32(atomicLoad(&grid[base]));
	if (d < 1.0) { return ffPost(vec4f(0.0, 0.0, 0.0, 1.0), postUv); }
	let avgC = (f32(atomicLoad(&grid[base + 1u])) / ${lit(COLOR_FIXED)}) / d;
	let t = clamp(log(1.0 + d) * u.exposure, 0.0, 1.0);
	return ffPost(vec4f(pal(avgC) * t, 1.0), postUv); // hue from structure, brightness from density
}
`;

export const ifsRenderer: ComputeRenderer = {
	id: IFS_ID,
	kind: '2d',
	pipeline: 'compute',
	accumulationChannels: 2,
	wgsl: WGSL,
	uniformSize: UNIFORM_SIZE,
	particleCount: PARTICLE_COUNT,
	stepsPerParticle: STEPS_PER_PARTICLE,
	packUniforms(view: DataView, input: RenderInput) {
		const { width, height, scene } = input;
		const f = (offset: number, value: number) => view.setFloat32(offset, value, true);
		const u32 = (offset: number, value: number) => view.setUint32(offset, value, true);
		f(0, width);
		f(4, height);
		u32(8, SYSTEM_INDEX[scene.ifs] ?? 0);
		u32(12, STEPS_PER_PARTICLE);
		f(16, scene.camera.centerX);
		f(20, scene.camera.centerY);
		f(24, scene.camera.scale);
		f(28, scene.maxIter * EXPOSURE_SCALE);
		const fr = FRAMINGS[scene.ifs] ?? FRAMINGS[IFS_SYSTEMS[0].id];
		f(32, fr.cx);
		f(36, fr.cy);
		f(40, fr.radius);
		// Fully formed (≥1 or absent) → the dense chaos game; otherwise ramp the
		// recursion depth so the fractal grows out of the solid frame.
		const formation = scene.formation ?? 1;
		const maxDepth = MAX_DEPTH[scene.ifs] ?? MAX_DEPTH[IFS_SYSTEMS[0].id];
		f(44, formation >= 1 ? FORMED : formation * maxDepth);
		const { coeffs: c, colormap } = resolvePalette(scene);
		f(48, c.a[0]);
		f(52, c.a[1]);
		f(56, c.a[2]);
		f(60, colormap); // palA.w: scientific-colormap code
		f(64, c.b[0]);
		f(68, c.b[1]);
		f(72, c.b[2]);
		f(80, c.c[0]);
		f(84, c.c[1]);
		f(88, c.c[2]);
		f(96, c.d[0]);
		f(100, c.d[1]);
		f(104, c.d[2]);
		// Seed-hull: pack up to HULL_MAX silhouette points two per vec4f, then a
		// meta vec4f (centroid.xy, vertex count). Only read while forming.
		const hull = HULLS[scene.ifs] ?? HULLS[IFS_SYSTEMS[0].id];
		const n = Math.min(HULL_MAX, hull.verts.length);
		for (let i = 0; i < n; i++) {
			f(HULL_BASE + (i >> 1) * 16 + (i & 1) * 8, hull.verts[i].x);
			f(HULL_BASE + (i >> 1) * 16 + (i & 1) * 8 + 4, hull.verts[i].y);
		}
		f(META_BASE, hull.centroid.x);
		f(META_BASE + 4, hull.centroid.y);
		f(META_BASE + 8, n);
		packPost(view, POST_BASE, scene.post);
	}
};
