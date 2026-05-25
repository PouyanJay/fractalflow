import { describe, it, expect } from 'vitest';
import { createWebGL2Backend } from './webgl2';
import { mandelbrotRenderer } from '$lib/fractals/deep-zoom-2d/renderer';
import type { ComputeRenderer } from '$lib/engine/types';

describe('createWebGL2Backend', () => {
	it('returns null when a webgl2 context cannot be created', () => {
		const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
		expect(createWebGL2Backend(canvas, mandelbrotRenderer)).toBeNull();
	});

	it('returns null for a compute-pipeline renderer (WebGPU-only)', () => {
		const compute: ComputeRenderer = {
			id: 'x',
			kind: '3d',
			pipeline: 'compute',
			wgsl: '',
			uniformSize: 16,
			packUniforms: () => {},
			particleCount: 1,
			stepsPerParticle: 1
		};
		// Should bail before ever touching the canvas/context.
		const canvas = {} as unknown as HTMLCanvasElement;
		expect(createWebGL2Backend(canvas, compute)).toBeNull();
	});
});
