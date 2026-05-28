import { describe, it, expect } from 'vitest';
import { mandelbulbRenderer, GEOMETRIC_3D_ID } from './renderer';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { RenderInput, SceneState } from '$lib/engine/types';

const pack = (over: Partial<SceneState> = {}) => {
	const view = new DataView(new ArrayBuffer(mandelbulbRenderer.uniformSize));
	const input: RenderInput = {
		width: 120,
		height: 90,
		timeMs: 0,
		scene: { ...createDefaultScene(), geometricShape: 'mandelbulb', ...over }
	};
	mandelbulbRenderer.packUniforms(view, input);
	return view;
};

const FORMATION_OFFSET = 24;
const glsl = 'glsl' in mandelbulbRenderer ? mandelbulbRenderer.glsl : '';

describe('mandelbulbRenderer', () => {
	it('is the dual-backend raymarch renderer for the Geometric 3D style', () => {
		expect(mandelbulbRenderer.id).toBe(GEOMETRIC_3D_ID);
		expect(mandelbulbRenderer.kind).toBe('3d');
		expect(mandelbulbRenderer.uniformSize % 16).toBe(0);
		expect(glsl).toBeTruthy(); // has a WebGL2 path
	});

	it('grows the DE iteration count, blending n→n+1 for a smooth ramp', () => {
		// The DE is evaluated at a parameterised iteration count, and the fractional
		// part blends adjacent depths (mix) so detail emerges smoothly, not in pops.
		for (const src of [mandelbulbRenderer.wgsl, glsl]) {
			expect(src).toContain('deAt');
			expect(src).toContain('maxItersFor');
			expect(src).toMatch(/mix\(\s*deAt/);
		}
		expect(mandelbulbRenderer.wgsl).toContain('u.formation'); // WGSL drives it from formation
		expect(glsl).toContain('uFormation'); // GLSL drives it from formation
	});

	it('packs formation (default fully formed), separate from raymarch quality', () => {
		expect(pack().getFloat32(FORMATION_OFFSET, true)).toBe(1); // absent → fully formed
		expect(pack({ formation: 1 }).getFloat32(FORMATION_OFFSET, true)).toBe(1);
		expect(pack({ formation: 0.3 }).getFloat32(FORMATION_OFFSET, true)).toBeCloseTo(0.3, 6);
		expect(pack({ formation: 0 }).getFloat32(FORMATION_OFFSET, true)).toBe(0);
		// Raymarch quality (offset 28) follows maxIter and is untouched by formation.
		expect(pack({ maxIter: 150, formation: 0.2 }).getFloat32(28, true)).toBe(150);
	});
});
