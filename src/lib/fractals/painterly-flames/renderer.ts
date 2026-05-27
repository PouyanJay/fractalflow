/**
 * Painterly Flames renderer — a WebGPU compute fractal-flame (flam3) engine.
 * Each particle runs the chaos game over the selected flame's weighted IFS and
 * plots its orbit, accumulating two channels per pixel: density (hit count) and
 * a colour sum (the blended colour coordinate). The fragment pass colours each
 * pixel by its average colour coordinate (structure) and sets brightness from
 * log-density — the classic painterly flame look. WebGPU-only.
 *
 * The per-flame transform WGSL is code-generated from the CPU FLAMES table in
 * flames.ts, so the GPU chaos game provably mirrors the reference (no
 * hand-transcribed affine coefficients). Reuses the shared Scene: camera is 2D
 * pan/zoom, maxIter = exposure, paletteIndex = palette, flame = which flame.
 *
 * Uniform layout (std140-compatible, 112 bytes):
 *   0  resolution : vec2f
 *   8  flame : u32     12 steps : u32
 *   16 centerX : f32  20 centerY : f32  24 scale : f32  28 exposure : f32
 *   32 cx : f32  36 cy : f32  40 radius : f32  44 time : f32
 *   48 palA  64 palB  80 palC  96 palD : vec4f
 */
import { resolvePalette } from '$lib/fractals/palette';
import { COLORMAP_WGSL } from '$lib/fractals/colormaps';
import { POST_SIZE, packPost, POST_WGSL_FIELDS, POST_WGSL_FN } from '$lib/fractals/post';
import { FLAMES, flameBounds, type VariationId } from './flames';
import type { ComputeRenderer, RenderInput } from '$lib/engine/types';

export const PAINTERLY_FLAMES_ID = 'flames';
const POST_BASE = 112;
const UNIFORM_SIZE = POST_BASE + POST_SIZE;
const PARTICLE_COUNT = 1 << 16;
const STEPS_PER_PARTICLE = 256;
// Colour coord in [0,1] → fixed-point u32 for atomic accumulation. 1024 keeps
// ~10-bit colour precision while leaving headroom before the u32 colour-sum
// accumulator could overflow on a very hot pixel (~4.2M hits).
const COLOR_FIXED = 1024;
const EXPOSURE_SCALE = 4.5e-4; // maxIter (50–1200) → log-density gain
const TRANSIENT = 20;

const FLAME_INDEX: Record<string, number> = Object.fromEntries(FLAMES.map((f, i) => [f.id, i]));
const VARIATION_INDEX: Record<VariationId, number> = {
	linear: 0,
	sinusoidal: 1,
	spherical: 2,
	swirl: 3,
	horseshoe: 4
};

interface Framing {
	cx: number;
	cy: number;
	radius: number;
}

const FRAMINGS: Record<string, Framing> = Object.fromEntries(
	FLAMES.map((f) => {
		const b = flameBounds(f);
		const radius = (Math.max(b.max.x - b.min.x, b.max.y - b.min.y) / 2) * 1.1 || 1;
		return [f.id, { cx: (b.min.x + b.max.x) / 2, cy: (b.min.y + b.max.y) / 2, radius }];
	})
);

// WGSL float literal that always carries a decimal point.
const lit = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** Code-generate the per-flame transform/colour/count switches from FLAMES. */
function generateFlameWgsl(): string {
	const stepCases = FLAMES.map((f, fi) => {
		const ks = f.transforms
			.map((t, ti) => {
				const [a, b, c, d, e, g] = t.affine;
				const vid = VARIATION_INDEX[t.variation];
				const x = `${lit(a)} * p.x + ${lit(b)} * p.y + ${lit(c)}`;
				const y = `${lit(d)} * p.x + ${lit(e)} * p.y + ${lit(g)}`;
				return `\t\t\tcase ${ti}u: { return variation(${vid}u, ${x}, ${y}); }`;
			})
			.join('\n');
		return `\t\tcase ${fi}u: {\n\t\t\tswitch k {\n${ks}\n\t\t\tdefault: {}\n\t\t\t}\n\t\t}`;
	}).join('\n');

	const colorCases = FLAMES.map((f, fi) => {
		const ks = f.transforms
			.map((t, ti) => `\t\t\tcase ${ti}u: { return ${lit(t.color)}; }`)
			.join('\n');
		return `\t\tcase ${fi}u: {\n\t\t\tswitch k {\n${ks}\n\t\t\tdefault: {}\n\t\t\t}\n\t\t}`;
	}).join('\n');

	const countCases = FLAMES.map(
		(f, fi) => `\t\tcase ${fi}u: { return ${f.transforms.length}u; }`
	).join('\n');

	return `
fn flameStep(flame: u32, k: u32, p: vec2f) -> vec2f {
	switch flame {
${stepCases}
	default: {}
	}
	return p;
}

fn flameColor(flame: u32, k: u32) -> f32 {
	switch flame {
${colorCases}
	default: {}
	}
	return 0.0;
}

fn flameCount(flame: u32) -> u32 {
	switch flame {
${countCases}
	default: {}
	}
	return 1u;
}`;
}

const WGSL = /* wgsl */ `
struct U {
	resolution: vec2f,
	flame: u32,
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

// Nonlinear variations — mirror VARIATIONS in flames.ts exactly.
fn variation(vid: u32, x: f32, y: f32) -> vec2f {
	switch vid {
		case 0u: { return vec2f(x, y); }
		case 1u: { return vec2f(sin(x), sin(y)); }
		case 2u: { let r2 = max(x * x + y * y, 1e-12); return vec2f(x / r2, y / r2); }
		case 3u: { let r2 = x * x + y * y; let s = sin(r2); let co = cos(r2); return vec2f(x * s - y * co, x * co + y * s); }
		default: { let r = sqrt(x * x + y * y); let inv = select(0.0, 1.0 / r, r > 1e-12); return vec2f(inv * (x - y) * (x + y), inv * 2.0 * x * y); }
	}
}
${generateFlameWgsl()}

fn rngNext(state: ptr<function, u32>) -> f32 {
	var s = *state;
	s = s * 747796405u + 2891336453u;
	*state = s;
	let word = ((s >> ((s >> 28u) + 4u)) ^ s) * 277803737u;
	return f32((word >> 22u) ^ word) / 4294967296.0;
}

fn project(p: vec2f) -> vec2f {
	let n = (p - vec2f(u.cx, u.cy)) / u.radius; // frame the flame to ~[-1,1]
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
	var p = vec2f(rngNext(&rng) * 2.0 - 1.0, rngNext(&rng) * 2.0 - 1.0);
	var c = rngNext(&rng);
	let count = flameCount(u.flame);
	for (var s = 0u; s < ${TRANSIENT}u; s = s + 1u) {
		let k = min(u32(rngNext(&rng) * f32(count)), count - 1u);
		p = flameStep(u.flame, k, p);
		c = (c + flameColor(u.flame, k)) * 0.5;
	}
	let w = u32(u.resolution.x);
	let h = u32(u.resolution.y);
	for (var s = 0u; s < u.steps; s = s + 1u) {
		let k = min(u32(rngNext(&rng) * f32(count)), count - 1u);
		p = flameStep(u.flame, k, p);
		c = (c + flameColor(u.flame, k)) * 0.5;
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

export const flamesRenderer: ComputeRenderer = {
	id: PAINTERLY_FLAMES_ID,
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
		u32(8, FLAME_INDEX[scene.flame] ?? 0);
		u32(12, STEPS_PER_PARTICLE);
		f(16, scene.camera.centerX);
		f(20, scene.camera.centerY);
		f(24, scene.camera.scale);
		f(28, scene.maxIter * EXPOSURE_SCALE);
		const fr = FRAMINGS[scene.flame] ?? FRAMINGS[FLAMES[0].id];
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
