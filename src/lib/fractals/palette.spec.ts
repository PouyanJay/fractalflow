import { describe, it, expect } from 'vitest';
import { cosinePalette, PALETTES } from './palette';

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
