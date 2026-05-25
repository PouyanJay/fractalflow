import { describe, it, expect } from 'vitest';
import { EXPORT_SIZES, exportFilename } from './capture';

describe('EXPORT_SIZES', () => {
	it('offers several resolutions with unique ids and positive dimensions', () => {
		expect(EXPORT_SIZES.length).toBeGreaterThanOrEqual(3);
		const ids = EXPORT_SIZES.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const s of EXPORT_SIZES) {
			expect(s.width).toBeGreaterThan(0);
			expect(s.height).toBeGreaterThan(0);
			expect(s.label.length).toBeGreaterThan(0);
		}
	});
});

describe('exportFilename', () => {
	it('builds a timestamped, formula-tagged .png name', () => {
		const name = exportFilename('mandelbrot', new Date('2026-05-25T01:02:03.456Z'));
		expect(name).toBe('fractalflow-mandelbrot-2026-05-25T01-02-03.png');
	});

	it('includes the formula and a .png extension', () => {
		const name = exportFilename('julia');
		expect(name.startsWith('fractalflow-julia-')).toBe(true);
		expect(name.endsWith('.png')).toBe(true);
	});
});
