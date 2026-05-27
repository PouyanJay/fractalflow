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

/** A CSS `linear-gradient(...)` sampling the palette across [0,1] for swatches. */
export function paletteCssGradient(p: PaletteCoeffs, steps = 6): string {
	const stops: string[] = [];
	for (let i = 0; i <= steps; i++) {
		const t = i / steps;
		const [r, g, b] = cosinePalette(p, t);
		stops.push(
			`rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}) ${Math.round(t * 100)}%`
		);
	}
	return `linear-gradient(90deg, ${stops.join(', ')})`;
}

const BALANCED: Pick<PaletteCoeffs, 'a' | 'b' | 'c'> = {
	a: [0.5, 0.5, 0.5],
	b: [0.5, 0.5, 0.5],
	c: [1, 1, 1]
};

/**
 * Curated cosine (Inigo Quilez) palettes. The first four are the originals and
 * MUST keep their index — `paletteIndex` is stored positionally in share links
 * and bookmarks — so every new palette is appended. Coefficients follow the
 * `a + b·cos(2π(c·t + d))` form; many derive from IQ's canonical sets.
 */
export const PALETTES: PalettePreset[] = [
	{ id: 'ember', label: 'Ember', coeffs: { ...BALANCED, d: [0.0, 0.1, 0.2] } },
	{ id: 'aurora', label: 'Aurora', coeffs: { ...BALANCED, d: [0.3, 0.2, 0.2] } },
	{ id: 'spectral', label: 'Spectral', coeffs: { ...BALANCED, d: [0.8, 0.9, 0.3] } },
	{ id: 'ice', label: 'Ice', coeffs: { ...BALANCED, d: [0.5, 0.55, 0.65] } },
	// --- appended ---
	{ id: 'rainbow', label: 'Rainbow', coeffs: { ...BALANCED, d: [0.0, 0.33, 0.67] } },
	{
		id: 'flame',
		label: 'Flame',
		coeffs: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 0.7, 0.4], d: [0.0, 0.15, 0.2] }
	},
	{
		id: 'neon',
		label: 'Neon',
		coeffs: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2, 1, 0], d: [0.5, 0.2, 0.25] }
	},
	{
		id: 'candy',
		label: 'Candy',
		coeffs: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [2, 1, 1], d: [0.0, 0.25, 0.25] }
	},
	{
		id: 'gold',
		label: 'Gold',
		coeffs: { a: [0.5, 0.45, 0.3], b: [0.5, 0.45, 0.3], c: [1, 1, 0.5], d: [0.0, 0.1, 0.2] }
	},
	{
		id: 'ocean',
		label: 'Ocean',
		coeffs: { a: [0.2, 0.4, 0.55], b: [0.25, 0.35, 0.45], c: [1, 1, 1], d: [0.5, 0.45, 0.35] }
	},
	{
		id: 'lava',
		label: 'Lava',
		coeffs: { a: [0.5, 0.35, 0.35], b: [0.5, 0.4, 0.35], c: [1, 1, 1], d: [0.0, 0.12, 0.25] }
	},
	{
		id: 'forest',
		label: 'Forest',
		coeffs: { a: [0.32, 0.5, 0.36], b: [0.28, 0.36, 0.26], c: [1, 1, 1], d: [0.4, 0.3, 0.2] }
	},
	{
		id: 'twilight',
		label: 'Twilight',
		coeffs: { a: [0.5, 0.45, 0.55], b: [0.45, 0.4, 0.5], c: [1, 1, 1], d: [0.6, 0.5, 0.7] }
	},
	{
		id: 'orchid',
		label: 'Orchid',
		coeffs: { a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0.5, 0.25, 0.0] }
	},
	{
		id: 'sunset',
		label: 'Sunset',
		coeffs: { a: [0.6, 0.4, 0.4], b: [0.4, 0.4, 0.3], c: [1, 1, 1], d: [0.1, 0.2, 0.4] }
	},
	{
		id: 'citrus',
		label: 'Citrus',
		coeffs: { a: [0.5, 0.5, 0.35], b: [0.45, 0.4, 0.3], c: [1, 1, 0.8], d: [0.6, 0.35, 0.05] }
	},
	{
		id: 'steel',
		label: 'Steel',
		coeffs: { a: [0.5, 0.52, 0.56], b: [0.45, 0.45, 0.5], c: [1, 1, 1], d: [0.5, 0.52, 0.58] }
	}
];

export function paletteById(id: string): PalettePreset {
	return PALETTES.find((p) => p.id === id) ?? PALETTES[0];
}
