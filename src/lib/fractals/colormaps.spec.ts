import { describe, it, expect } from 'vitest';
import { colormapRgb, COLORMAPS, COLORMAP_WGSL, COLORMAP_GLSL } from './colormaps';

describe('colormapRgb', () => {
	it('viridis runs dark-purple → teal → yellow', () => {
		const [r0, g0, b0] = colormapRgb(1, 0);
		expect(r0).toBeGreaterThan(0.2);
		expect(r0).toBeLessThan(0.35);
		expect(g0).toBeLessThan(0.05); // almost no green at the dark end
		expect(b0).toBeGreaterThan(0.3); // purple/blue

		const [r5, g5] = colormapRgb(1, 0.5);
		expect(g5).toBeGreaterThan(0.45); // teal middle is green-dominant
		expect(g5).toBeGreaterThan(r5);

		const [r1, g1, b1] = colormapRgb(1, 1);
		expect(r1).toBeGreaterThan(0.9); // yellow end
		expect(g1).toBeGreaterThan(0.8);
		expect(b1).toBeLessThan(0.3);
	});

	it('turbo ends warm (high t is red-dominant) and starts cool/dark', () => {
		const [r1, g1, b1] = colormapRgb(5, 1);
		expect(r1).toBeGreaterThan(g1);
		expect(r1).toBeGreaterThan(b1);
		const [, , b0] = colormapRgb(5, 0);
		expect(b0).toBeGreaterThan(0.05); // not pure black at the cool end
	});

	it('clamps output to [0,1] across the range for every colormap', () => {
		for (const m of COLORMAPS) {
			for (let i = 0; i <= 20; i++) {
				const rgb = colormapRgb(m.code, i / 20);
				for (const ch of rgb) {
					expect(ch).toBeGreaterThanOrEqual(0);
					expect(ch).toBeLessThanOrEqual(1);
				}
			}
		}
	});
});

describe('generated shader code', () => {
	it('emits a cmap() function for both WGSL and GLSL with all five maps', () => {
		expect(COLORMAP_WGSL).toContain('fn cmap(id: i32, t: f32) -> vec3f');
		expect(COLORMAP_GLSL).toContain('vec3 cmap(int id, float t)');
		for (const id of [1, 2, 3, 4]) {
			expect(COLORMAP_WGSL).toContain(`id == ${id}`);
			expect(COLORMAP_GLSL).toContain(`id == ${id}`);
		}
		// Turbo basis present in both.
		expect(COLORMAP_WGSL).toContain('v4.zw * v4.z');
		expect(COLORMAP_GLSL).toContain('v4.zw * v4.z');
	});
});
