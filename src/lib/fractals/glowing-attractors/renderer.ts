/**
 * Glowing Attractors renderer — a WebGPU compute particle accumulator. The
 * compute pass walks many particles along the selected strange attractor and
 * atomically accumulates a density grid; the fragment pass tone-maps that grid
 * with a saturating exposure curve and a cosine palette, so the attractor glows
 * out of black. WebGPU-only (no fragment/WebGL2 path).
 *
 * Reuses the shared Scene: camera.centerX = orbit yaw, camera.centerY = pitch,
 * camera.scale = zoom, maxIter = exposure, paletteIndex = palette,
 * attractor = which family. The WGSL maps mirror the CPU reference in
 * attractors.ts (same constants and integration steps), and each family's
 * framing is derived from that reference's bounded orbit.
 *
 * Uniform layout (std140-compatible, 112 bytes):
 *   0  resolution : vec2f
 *   8  family : u32     12 steps : u32
 *   16 yaw : f32  20 pitch : f32  24 zoom : f32  28 exposure : f32
 *   32 cx : f32   36 cy : f32     40 cz : f32    44 radius : f32
 *   48 palA  64 palB  80 palC  96 palD : vec4f
 */
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL } from '$lib/fractals/colormaps';
import { POST_SIZE, packPost, POST_WGSL_FIELDS, POST_WGSL_FN } from '$lib/fractals/post';
import { revealedSteps } from '$lib/fractals/formation';
import { ATTRACTORS, orbit, boundsOf } from './attractors';
import type { ComputeRenderer, RenderInput } from '$lib/engine/types';

export const GLOWING_ATTRACTORS_ID = 'attractors';
const POST_BASE = 112;
const UNIFORM_SIZE = POST_BASE + POST_SIZE;
const PARTICLE_COUNT = 1 << 16; // 65 536 particles per frame
const STEPS_PER_PARTICLE = 256;
// maxIter (50–1200) → gain on the log-density tone curve.
const EXPOSURE_SCALE = 4.5e-4;
// Flow "pen sweep": lead lanes trace the reference orbit in index order while
// forming. Lane i plots a SWEEP_ARC arc starting SWEEP_STRIDE·i steps in, so the
// SWEEP_LANES lanes together draw ~SWEEP_LANES·SWEEP_STRIDE steps of one orbit.
const SWEEP_LANES = 4096;
const SWEEP_STRIDE = 10;
const SWEEP_ARC = 32;

const FAMILY_INDEX: Record<string, number> = Object.fromEntries(
	ATTRACTORS.map((a, i) => [a.id, i])
);

interface Framing {
	cx: number;
	cy: number;
	cz: number;
	radius: number;
}

// Frame each family from its reference orbit so the point cloud fills the view.
const FRAMINGS: Record<string, Framing> = Object.fromEntries(
	ATTRACTORS.map((a) => {
		const b = boundsOf(orbit(a, 4000));
		const radius = Math.max(b.max.x - b.min.x, b.max.y - b.min.y, b.max.z - b.min.z) / 2 || 1;
		return [
			a.id,
			{
				cx: (b.min.x + b.max.x) / 2,
				cy: (b.min.y + b.max.y) / 2,
				cz: (b.min.z + b.max.z) / 2,
				radius
			}
		];
	})
);

const WGSL = /* wgsl */ `
struct U {
	resolution: vec2f,
	family: u32,
	steps: u32,
	yaw: f32,
	pitch: f32,
	zoom: f32,
	exposure: f32,
	cx: f32,
	cy: f32,
	cz: f32,
	radius: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
${POST_WGSL_FIELDS}
};
@group(0) @binding(0) var<uniform> u: U;
@group(0) @binding(1) var<storage, read_write> density: array<atomic<u32>>;
${POST_WGSL_FN}

// Discrete maps (Clifford, de Jong) collapse onto the attractor within a few
// iterations; the integrated flows (Lorenz, Thomas) need many small steps to
// leave the transient and settle onto the manifold before we accumulate.
fn skipFor(fam: u32) -> u32 {
	return select(32u, 512u, fam >= 2u);
}

// Vector field of the 3D flows. Constants mirror attractors.ts exactly.
fn flowDeriv(p: vec3f, fam: u32) -> vec3f {
	if (fam == 2u) { // Lorenz
		let s = 10.0; let r = 28.0; let be = 8.0 / 3.0;
		return vec3f(s * (p.y - p.x), p.x * (r - p.z) - p.y, p.x * p.y - be * p.z);
	}
	if (fam == 3u) { // Thomas
		let b = 0.208186;
		return vec3f(sin(p.y) - b * p.x, sin(p.z) - b * p.y, sin(p.x) - b * p.z);
	}
	if (fam == 4u) { // Aizawa
		let a = 0.95; let b = 0.7; let c = 0.6; let d = 3.5; let e = 0.25; let f = 0.1;
		return vec3f(
			(p.z - b) * p.x - d * p.y,
			d * p.x + (p.z - b) * p.y,
			c + a * p.z - p.z * p.z * p.z / 3.0 - (p.x * p.x + p.y * p.y) * (1.0 + e * p.z) + f * p.z * p.x * p.x * p.x
		);
	}
	if (fam == 5u) { // Rössler (a = b = 0.2, c = 5.7)
		let a = 0.2; let c = 5.7;
		return vec3f(-p.y - p.z, p.x + a * p.y, 0.2 + p.z * (p.x - c));
	}
	if (fam == 6u) { // Halvorsen
		let a = 1.4;
		return vec3f(
			-a * p.x - 4.0 * p.y - 4.0 * p.z - p.y * p.y,
			-a * p.y - 4.0 * p.z - 4.0 * p.x - p.z * p.z,
			-a * p.z - 4.0 * p.x - 4.0 * p.y - p.x * p.x
		);
	}
	if (fam == 7u) { // Chen
		let a = 35.0; let b = 3.0; let c = 28.0;
		return vec3f(a * (p.y - p.x), (c - a) * p.x - p.x * p.z + c * p.y, p.x * p.y - b * p.z);
	}
	// Dadras (8)
	let a = 3.0; let b = 2.7; let c = 1.7; let d = 2.0; let e = 9.0;
	return vec3f(p.y - a * p.x + b * p.y * p.z, c * p.y - p.x * p.z + p.z, d * p.x * p.y - e * p.z);
}

// Per-flow integration step (mirrors FLOW_DT in attractors.ts).
fn dtFor(fam: u32) -> f32 {
	if (fam == 3u) { return 0.05; }
	if (fam == 5u) { return 0.03; }
	if (fam == 7u) { return 0.005; }
	return 0.01; // Lorenz, Aizawa, Halvorsen, Dadras
}

fn rk4(p: vec3f, dt: f32, fam: u32) -> vec3f {
	let k1 = flowDeriv(p, fam);
	let k2 = flowDeriv(p + 0.5 * dt * k1, fam);
	let k3 = flowDeriv(p + 0.5 * dt * k2, fam);
	let k4 = flowDeriv(p + dt * k3, fam);
	return p + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4);
}

// Mirrors the CPU reference in attractors.ts (identical constants and steps).
fn stepAttractor(p: vec3f, fam: u32) -> vec3f {
	if (fam == 0u) { // Clifford
		let a = -1.4; let b = 1.6; let c = 1.0; let d = 0.7;
		return vec3f(sin(a * p.y) + c * cos(a * p.x), sin(b * p.x) + d * cos(b * p.y), 0.0);
	} else if (fam == 1u) { // de Jong
		let a = 1.4; let b = -2.3; let c = 2.4; let d = -2.1;
		return vec3f(sin(a * p.y) - cos(b * p.x), sin(c * p.x) - cos(d * p.y), 0.0);
	}
	// Every other family is an integrated 3D flow.
	return rk4(p, dtFor(fam), fam);
}

// Hash an invocation index into three [0,1) reals to scatter seed points.
fn hash3(i: u32) -> vec3f {
	var h = i * 747796405u + 2891336453u;
	h = ((h >> ((h >> 28u) + 4u)) ^ h) * 277803737u;
	var g = (i + 1u) * 2654435761u;
	g = g ^ (g >> 15u);
	return vec3f(
		f32(h & 0xffffu) / 65535.0,
		f32((h >> 16u) & 0xffffu) / 65535.0,
		f32(g & 0xffffu) / 65535.0
	);
}

fn seedFor(i: u32) -> vec3f {
	let h = hash3(i) - vec3f(0.5);
	return vec3f(u.cx, u.cy, u.cz) + h * (u.radius * 1.5);
}

// A per-particle "birth phase" in [0,1), decorrelated from its seed, so the
// Formation trace builds from a sparse scatter of strokes rather than a faint
// full ghost: a particle only joins once progress passes its birth phase.
fn birthPhase(i: u32) -> f32 {
	var h = (i ^ 0x9e3779b9u) * 2654435761u;
	h = h ^ (h >> 16u);
	return f32(h & 0xffffffu) / 16777216.0;
}

fn rotate(p: vec3f) -> vec3f {
	let cy = cos(u.yaw); let sy = sin(u.yaw);
	let cx = cos(u.pitch); let sx = sin(u.pitch);
	let q = vec3f(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z); // yaw about Y
	return vec3f(q.x, cx * q.y - sx * q.z, sx * q.y + cx * q.z); // pitch about X
}

fn project(p: vec3f) -> vec2f {
	let n = (p - vec3f(u.cx, u.cy, u.cz)) / u.radius;
	let r = rotate(n);
	let s = u.zoom * 0.45 * min(u.resolution.x, u.resolution.y);
	return vec2f(u.resolution.x * 0.5 + r.x * s, u.resolution.y * 0.5 - r.y * s);
}

fn plotDensity(p: vec3f, w: u32, h: u32) {
	let sc = project(p);
	let x = i32(floor(sc.x));
	let y = i32(floor(sc.y));
	if (x >= 0 && y >= 0 && x < i32(w) && y < i32(h)) {
		atomicAdd(&density[u32(y) * w + u32(x)], 1u);
	}
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x;
	// Formation progress, recovered from the revealed step count (full = ${STEPS_PER_PARTICLE}).
	let progress = f32(u.steps) / ${STEPS_PER_PARTICLE}.0;
	let w = u32(u.resolution.x);
	let h = u32(u.resolution.y);
	let skip = skipFor(u.family);

	// Flows (family ≥ 2) trace a connected curve, so while forming the lead lanes
	// sweep the reference orbit in index order — a pen drawing the attractor out.
	if (progress < 1.0 && u.family >= 2u) {
		let head = u32(progress * ${SWEEP_LANES}.0);
		if (i >= ${SWEEP_LANES}u || i > head) { return; }
		var q = vec3f(u.cx, u.cy, u.cz); // all lanes share one seed → one orbit
		let advance = skip + i * ${SWEEP_STRIDE}u;
		for (var s = 0u; s < advance; s = s + 1u) { q = stepAttractor(q, u.family); }
		for (var s = 0u; s < ${SWEEP_ARC}u; s = s + 1u) {
			q = stepAttractor(q, u.family);
			plotDensity(q, w, h);
		}
		return;
	}

	// Discrete maps (and the fully-formed view): materialise growing per-particle
	// arcs, staggered by a hashed birth phase so they build from a sparse scatter.
	if (progress < 1.0 && birthPhase(i) > progress) { return; }
	var p = seedFor(i);
	for (var s = 0u; s < skip; s = s + 1u) { p = stepAttractor(p, u.family); }
	for (var s = 0u; s < u.steps; s = s + 1u) {
		p = stepAttractor(p, u.family);
		plotDensity(p, w, h);
	}
}

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
	let p = vec2f(f32((vi << 1u) & 2u), f32(vi & 2u));
	return vec4f(p * 2.0 - 1.0, 0.0, 1.0);
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
	// Warp the sample coordinate so kaleidoscope/mirror fold the cloud.
	let wp = ffWarp(pos.xy - u.resolution * 0.5) + u.resolution * 0.5;
	let px = i32(floor(wp.x));
	let py = i32(floor(wp.y));
	if (px < 0 || py < 0 || px >= i32(u.resolution.x) || py >= i32(u.resolution.y)) {
		return ffPost(vec4f(0.0, 0.0, 0.0, 1.0), postUv);
	}
	let idx = u32(py) * u32(u.resolution.x) + u32(px);
	if (idx >= arrayLength(&density)) { return ffPost(vec4f(0.0, 0.0, 0.0, 1.0), postUv); }
	let d = f32(atomicLoad(&density[idx]));
	// Log-density tone mapping: attractors span a huge density range (Lorenz
	// piles up near its fixed points), so log compresses the bright core and
	// keeps the faint filaments visible. Exposure is the gain on the log.
	let t = clamp(log(1.0 + d) * u.exposure, 0.0, 1.0);
	return ffPost(vec4f(pal(t) * t, 1.0), postUv); // multiply by t so empty space stays black
}
`;

export const attractorsRenderer: ComputeRenderer = {
	id: GLOWING_ATTRACTORS_ID,
	kind: '3d',
	pipeline: 'compute',
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
		u32(8, FAMILY_INDEX[scene.attractor] ?? 0);
		// Formation "traces the orbit": plot only a growing prefix of each
		// particle's contiguous trajectory so strokes lengthen into the attractor.
		u32(12, revealedSteps(scene.formation, STEPS_PER_PARTICLE));
		f(16, scene.camera.centerX); // yaw
		f(20, scene.camera.centerY); // pitch
		f(24, scene.camera.scale); // zoom
		f(28, scene.maxIter * EXPOSURE_SCALE); // exposure
		const fr = FRAMINGS[scene.attractor] ?? FRAMINGS[ATTRACTORS[0].id];
		f(32, fr.cx);
		f(36, fr.cy);
		f(40, fr.cz);
		f(44, fr.radius);
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
		packPost(view, POST_BASE, scene.post);
	}
};
