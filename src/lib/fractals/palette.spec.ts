import { describe, it, expect } from 'vitest';
import {
	cosinePalette,
	paletteCssGradient,
	PALETTES,
	resolvePalette,
	type PaletteCoeffs
} from './palette';

describe('cosinePalette', () => {
	it('returns channel values within [0, 1]', () => {
		const { coeffs } = PALETTES[0];
		for (const t of [0, 0.25, 0.5, 0.75, 1]) {
			for (const channel of cosinePalette(coeffs, t)) {
				expect(channel).toBeGreaterThanOrEqual(0);
				expect(channel).toBeLessThanOrEqual(1);
			}
		}
	});

	it('matches the closed form at t=0 for a known coefficient set', () => {
		const rgb = cosinePalette(
			{ a: [0.5, 0.5, 0.5], b: [0.5, 0.5, 0.5], c: [1, 1, 1], d: [0, 0, 0] },
			0
		);
		// 0.5 + 0.5*cos(0) = 1 on every channel
		expect(rgb).toEqual([1, 1, 1]);
	});
});

describe('paletteCssGradient', () => {
	it('builds a horizontal linear-gradient sampling the palette', () => {
		const css = paletteCssGradient(PALETTES[0].coeffs);
		expect(css.startsWith('linear-gradient(90deg,')).toBe(true);
		expect(css).toContain('0%');
		expect(css).toContain('100%');
		expect(css.match(/rgb\(/g)?.length).toBe(7); // steps 0..6 inclusive
	});
});

describe('PALETTES', () => {
	it('provides several named presets with unique ids', () => {
		expect(PALETTES.length).toBeGreaterThanOrEqual(3);
		const ids = PALETTES.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const p of PALETTES) {
			expect(p.id.length).toBeGreaterThan(0);
			expect(p.label.length).toBeGreaterThan(0);
		}
	});
});

describe('resolvePalette', () => {
	it('prefers an inline custom palette over the index (colormap forced off)', () => {
		const coeffs: PaletteCoeffs = {
			a: [0.1, 0.2, 0.3],
			b: [0.4, 0.5, 0.6],
			c: [1, 1, 1],
			d: [0, 0, 0]
		};
		const r = resolvePalette({ paletteIndex: 0, paletteCoeffs: coeffs });
		expect(r.coeffs).toBe(coeffs);
		expect(r.colormap).toBe(0);
	});

	it('falls back to the indexed preset (carrying its colormap code)', () => {
		const idx = PALETTES.findIndex((p) => p.colormap);
		const r = resolvePalette({ paletteIndex: idx });
		expect(r.coeffs).toBe(PALETTES[idx].coeffs);
		expect(r.colormap).toBe(PALETTES[idx].colormap);
	});
});
