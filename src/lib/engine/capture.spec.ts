import { describe, it, expect } from 'vitest';
import { EXPORT_SIZES, exportFilename, exportTagFor } from './capture';

describe('exportTagFor', () => {
	const scene = { formula: 'julia', attractor: 'lorenz', flame: 'swirl', ifs: 'dragon-curve' };

	it('tags Deep-Zoom 2D exports with the active formula', () => {
		expect(exportTagFor('deep-zoom-2d', scene)).toBe('julia');
	});

	it('tags attractor, flame and IFS exports with their variant', () => {
		expect(exportTagFor('attractors', scene)).toBe('attractor-lorenz');
		expect(exportTagFor('flames', scene)).toBe('flame-swirl');
		expect(exportTagFor('ifs', scene)).toBe('ifs-dragon-curve');
	});

	it('falls back to the style id, then a generic tag', () => {
		expect(exportTagFor('geometric-3d', scene)).toBe('geometric-3d');
		expect(exportTagFor(null, scene)).toBe('fractal');
	});
});

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
