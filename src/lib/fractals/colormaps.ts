/**
 * Scientific colormaps (viridis / magma / inferno / plasma / turbo) as compact
 * polynomial approximations — smooth, exact-looking, and cheap on the GPU (no
 * lookup texture). The coefficients live here ONCE and are both evaluated on the
 * CPU (for swatches) and code-generated into WGSL/GLSL (for the shaders), so the
 * two can never drift.
 *
 *  - viridis/magma/inferno/plasma: degree-6 RGB polynomials (Matt Zucker,
 *    https://www.shadertoy.com/view/WlfXRN).
 *  - turbo: Google's fit (Anton Mikhailov,
 *    https://gist.github.com/mikhailov-work/0d177465a8151eb6ede1768d51d476c7).
 *
 * A colormap is selected by a small positive integer code (0 = "none", i.e. use
 * the cosine palette instead); the code is passed to the shader in palA.w.
 */
import type { Rgb } from './palette';

export interface ColormapMeta {
	id: string;
	label: string;
	/** Shader/uniform code (1-based; 0 means "not a colormap"). */
	code: number;
}

/** Degree-6 polynomial coefficients c0..c6 (RGB) for the four matplotlib maps. */
const POLY: Record<number, Rgb[]> = {
	1: [
		// viridis
		[0.277727327, 0.005407345, 0.334099805],
		[0.105093043, 1.40461353, 1.384590163],
		[-0.330861829, 0.214847559, 0.095095163],
		[-4.634230499, -5.799100973, -19.33244096],
		[6.228269936, 14.17993337, 56.6905526],
		[4.776384998, -13.74514538, -65.35303263],
		[-5.435455856, 4.645852612, 26.31243525]
	],
	2: [
		// magma
		[-0.002136485, -0.000749655, -0.005386128],
		[0.251660541, 0.677523244, 2.494026599],
		[8.353717279, -3.577719515, 0.314467903],
		[-27.66873309, 14.26473078, -13.64921319],
		[52.17613981, -27.94360607, 12.94416944],
		[-50.76852536, 29.04658282, 4.234152994],
		[18.65570507, -11.48977352, -5.601961509]
	],
	3: [
		// inferno
		[0.00021894, 0.001651005, -0.019480898],
		[0.106513419, 0.563956437, 3.932712389],
		[11.60249308, -3.972853966, -15.94239411],
		[-41.70399613, 17.43639888, 44.3541452],
		[77.1629357, -33.40235894, -81.80730926],
		[-71.31942824, 32.62606426, 73.20951986],
		[25.13112622, -12.24266895, -23.070325]
	],
	4: [
		// plasma
		[0.058732344, 0.023336709, 0.543340183],
		[2.176514634, 0.238383417, 0.75396046],
		[-2.689460476, -7.455851136, 3.11079994],
		[6.130348346, 42.34618815, -28.51885465],
		[-11.10743619, -82.66631109, 60.13984767],
		[10.02306558, 71.4136177, -54.07218656],
		[-3.658713843, -22.93153465, 18.19190779]
	]
};

/** Turbo coefficients (v4 = [1,x,x²,x³], v2 = [x⁴,x⁵]). */
const TURBO = {
	red4: [0.13572138, 4.6153926, -42.66032258, 132.13108234],
	green4: [0.09140261, 2.19418839, 4.84296658, -14.18503333],
	blue4: [0.1066733, 12.64194608, -60.58204836, 110.36276771],
	red2: [-152.94239396, 59.28637943],
	green2: [4.27729857, 2.82956604],
	blue2: [-89.90310912, 27.34824973]
};

export const COLORMAPS: readonly ColormapMeta[] = [
	{ id: 'viridis', label: 'Viridis', code: 1 },
	{ id: 'magma', label: 'Magma', code: 2 },
	{ id: 'inferno', label: 'Inferno', code: 3 },
	{ id: 'plasma', label: 'Plasma', code: 4 },
	{ id: 'turbo', label: 'Turbo', code: 5 }
];

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** Evaluate colormap `code` (1..5) at t ∈ [0,1] on the CPU. */
export function colormapRgb(code: number, t: number): Rgb {
	const x = clamp01(t);
	if (code === 5) {
		const v4 = [1, x, x * x, x * x * x];
		const v2 = [x * x * x * x, x * x * x * x * x];
		const dot = (a: number[], b: number[]) => a.reduce((s, ai, i) => s + ai * b[i], 0);
		return [
			clamp01(dot(TURBO.red4, v4) + dot(TURBO.red2, v2)),
			clamp01(dot(TURBO.green4, v4) + dot(TURBO.green2, v2)),
			clamp01(dot(TURBO.blue4, v4) + dot(TURBO.blue2, v2))
		];
	}
	const c = POLY[code] ?? POLY[1];
	return [0, 1, 2].map((ch) => {
		let v = c[6][ch];
		for (let k = 5; k >= 0; k--) v = v * x + c[k][ch];
		return clamp01(v);
	}) as Rgb;
}

// --- Shader code generation (single source of truth = the tables above) -------

const v3 = (rgb: Rgb): string => `vec3(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
const v3wgsl = (rgb: Rgb): string => `vec3f(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

/** Horner-form polynomial body `c0 + x*(c1 + x*(… + x*c6))` for a vec3 ctor `vc`. */
function hornerBody(code: number, vc: (rgb: Rgb) => string): string {
	const c = POLY[code];
	let expr = vc(c[6]);
	for (let k = 5; k >= 0; k--) expr = `${vc(c[k])} + x * (${expr})`;
	return expr;
}

function turboBody(vec3ctor: string, vec4ctor: string, vec2ctor: string): string {
	const d4 = (a: number[]) => `dot(v4, ${vec4ctor}(${a.join(', ')}))`;
	const d2 = (a: number[]) => `dot(v2, ${vec2ctor}(${a.join(', ')}))`;
	return `${vec3ctor}(
		${d4(TURBO.red4)} + ${d2(TURBO.red2)},
		${d4(TURBO.green4)} + ${d2(TURBO.green2)},
		${d4(TURBO.blue4)} + ${d2(TURBO.blue2)})`;
}

/** WGSL: `fn cmap(id: i32, t: f32) -> vec3f`. */
export const COLORMAP_WGSL = `
fn cmap(id: i32, t: f32) -> vec3f {
	let x = clamp(t, 0.0, 1.0);
	if (id == 1) { return clamp(${hornerBody(1, v3wgsl)}, vec3f(0.0), vec3f(1.0)); }
	if (id == 2) { return clamp(${hornerBody(2, v3wgsl)}, vec3f(0.0), vec3f(1.0)); }
	if (id == 3) { return clamp(${hornerBody(3, v3wgsl)}, vec3f(0.0), vec3f(1.0)); }
	if (id == 4) { return clamp(${hornerBody(4, v3wgsl)}, vec3f(0.0), vec3f(1.0)); }
	let v4 = vec4f(1.0, x, x * x, x * x * x);
	let v2 = v4.zw * v4.z;
	return clamp(${turboBody('vec3f', 'vec4f', 'vec2f')}, vec3f(0.0), vec3f(1.0));
}
`;

/** GLSL ES: `vec3 cmap(int id, float t)`. */
export const COLORMAP_GLSL = `
vec3 cmap(int id, float t) {
	float x = clamp(t, 0.0, 1.0);
	if (id == 1) { return clamp(${hornerBody(1, v3)}, 0.0, 1.0); }
	if (id == 2) { return clamp(${hornerBody(2, v3)}, 0.0, 1.0); }
	if (id == 3) { return clamp(${hornerBody(3, v3)}, 0.0, 1.0); }
	if (id == 4) { return clamp(${hornerBody(4, v3)}, 0.0, 1.0); }
	vec4 v4 = vec4(1.0, x, x * x, x * x * x);
	vec2 v2 = v4.zw * v4.z;
	return clamp(${turboBody('vec3', 'vec4', 'vec2')}, 0.0, 1.0);
}
`;
