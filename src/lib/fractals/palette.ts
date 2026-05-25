/**
 * Procedural cosine palettes (Inigo Quilez): color = a + b * cos(2π(c·t + d)).
 * Compact (four vec3 coefficients), no lookup textures, and identical to evaluate
 * on CPU (here) and GPU (shader) — so coloring stays consistent across backends.
 */

export type Rgb = [number, number, number];

export interface PaletteCoeffs {
	a: Rgb;
	b: Rgb;
	c: Rgb;
	d: Rgb;
}

export interface PalettePreset {
	id: string;
	label: string;
	coeffs: PaletteCoeffs;
}

const TAU = Math.PI * 2;
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export function cosinePalette(p: PaletteCoeffs, t: number): Rgb {
	return [0, 1, 2].map((i) =>
		clamp01(p.a[i] + p.b[i] * Math.cos(TAU * (p.c[i] * t + p.d[i])))
	) as Rgb;
}

const BALANCED: Pick<PaletteCoeffs, 'a' | 'b' | 'c'> = {
	a: [0.5, 0.5, 0.5],
	b: [0.5, 0.5, 0.5],
	c: [1, 1, 1]
};

export const PALETTES: PalettePreset[] = [
	{ id: 'ember', label: 'Ember', coeffs: { ...BALANCED, d: [0.0, 0.1, 0.2] } },
	{ id: 'aurora', label: 'Aurora', coeffs: { ...BALANCED, d: [0.3, 0.2, 0.2] } },
	{ id: 'spectral', label: 'Spectral', coeffs: { ...BALANCED, d: [0.8, 0.9, 0.3] } },
	{ id: 'ice', label: 'Ice', coeffs: { ...BALANCED, d: [0.5, 0.55, 0.65] } }
];

export function paletteById(id: string): PalettePreset {
	return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
