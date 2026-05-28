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

	it('grows the DE iteration count: both shader paths ramp formationIters', () => {
		expect(mandelbulbRenderer.wgsl).toContain('fn formationIters');
		expect(glsl).toContain('int formationIters');
		// Each DE loop is bounded by the ramped count, not a literal.
		expect(mandelbulbRenderer.wgsl).toContain('formationIters(8)'); // bulb
		expect(mandelbulbRenderer.wgsl).toContain('formationIters(11)'); // mandelbox
		expect(mandelbulbRenderer.wgsl).toContain('formationIters(4)'); // menger
		expect(mandelbulbRenderer.wgsl).toContain('formationIters(10)'); // quaternion julia
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
