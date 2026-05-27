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
 *   32 cx : f32  36 cy : f32  40 radius : f32  44 time : f32
 *   48 palA  64 palB  80 palC  96 palD : vec4f
 */
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL } from '$lib/fractals/colormaps';
import { POST_SIZE, packPost, POST_WGSL_FIELDS, POST_WGSL_FN } from '$lib/fractals/post';
import { IFS_SYSTEMS, ifsBounds } from './ifs';
import type { ComputeRenderer, RenderInput } from '$lib/engine/types';

export const IFS_ID = 'ifs';
const POST_BASE = 112;
const UNIFORM_SIZE = POST_BASE + POST_SIZE;
const PARTICLE_COUNT = 1 << 16;
const STEPS_PER_PARTICLE = 256;
// Colour coord in [0,1] → fixed-point u32 for atomic accumulation (mirrors flames).
const COLOR_FIXED = 1024;
const EXPOSURE_SCALE = 4.5e-4; // maxIter (50–1200) → log-density gain
const TRANSIENT = 30;

const SYSTEM_INDEX: Record<string, number> = Object.fromEntries(
	IFS_SYSTEMS.map((s, i) => [s.id, i])
);

interface Framing {
	cx: number;
	cy: number;
	radius: number;
}

const FRAMINGS: Record<string, Framing> = Object.fromEntries(
	IFS_SYSTEMS.map((s) => {
		const b = ifsBounds(s);
		const radius = (Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2) * 1.08 || 1;
		return [s.id, { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, radius }];
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
	time: f32,
	palA: vec4f,
	palB: vec4f,
	palC: vec4f,
	palD: vec4f,
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

fn project(p: vec2f) -> vec2f {
	let n = (p - vec2f(u.cx, u.cy)) / u.radius; // frame the attractor to ~[-1,1]
	let ppu = u.resolution.y / u.scale; // pixels per unit (scale = vertical extent)
	return vec2f(
		u.resolution.x * 0.5 + (n.x - u.centerX) * ppu,
		u.resolution.y * 0.5 - (n.y - u.centerY) * ppu
	);
}

@compute @workgroup_size(64)
fn integrate(@builtin(global_invocation_id) gid: vec3u) {
	let i = gid.x;
	var rng = i * 747796405u + 2891336453u;
	var p = vec2f(rngNext(&rng) * 0.2 - 0.1, rngNext(&rng) * 0.2 - 0.1);
	var c = rngNext(&rng);
	for (var s = 0u; s < ${TRANSIENT}u; s = s + 1u) {
		let k = ifsPick(u.system, rngNext(&rng));
		p = ifsStep(u.system, k, p);
		c = (c + ifsColor(u.system, k)) * 0.5;
	}
	let w = u32(u.resolution.x);
	let h = u32(u.resolution.y);
	for (var s = 0u; s < u.steps; s = s + 1u) {
		let k = ifsPick(u.system, rngNext(&rng));
		p = ifsStep(u.system, k, p);
		c = (c + ifsColor(u.system, k)) * 0.5;
		let sc = project(p);
		let x = i32(floor(sc.x));
		let y = i32(floor(sc.y));
		if (x >= 0 && y >= 0 && x < i32(w) && y < i32(h)) {
			let base = (u32(y) * w + u32(x)) * 2u;
			atomicAdd(&grid[base], 1u);
			atomicAdd(&grid[base + 1u], u32(c * ${lit(COLOR_FIXED)}));
		}
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
		const { width, height, timeMs, scene } = input;
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
		f(44, timeMs);
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
