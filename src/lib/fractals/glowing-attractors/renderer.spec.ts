import { describe, it, expect } from 'vitest';
import { attractorsRenderer, GLOWING_ATTRACTORS_ID } from './renderer';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { RenderInput } from '$lib/engine/types';

const input = (attractor: string): RenderInput => ({
	width: 100,
	height: 80,
	timeMs: 0,
	scene: { ...createDefaultScene(), attractor }
});

const pack = (attractor: string, formation?: number) => {
	const view = new DataView(new ArrayBuffer(attractorsRenderer.uniformSize));
	const base = input(attractor);
	attractorsRenderer.packUniforms(view, { ...base, scene: { ...base.scene, formation } });
	return view;
};

describe('attractorsRenderer', () => {
	it('is the WebGPU compute renderer for the attractors art style', () => {
		expect(attractorsRenderer.id).toBe(GLOWING_ATTRACTORS_ID);
		expect(attractorsRenderer.pipeline).toBe('compute');
		expect(attractorsRenderer.kind).toBe('3d');
		expect(attractorsRenderer.particleCount).toBeGreaterThan(0);
		expect(attractorsRenderer.stepsPerParticle).toBeGreaterThan(0);
		expect(attractorsRenderer.uniformSize % 16).toBe(0);
	});

	it('packs resolution, the selected family index and a positive framing radius', () => {
		const view = pack('lorenz');
		expect(view.getFloat32(0, true)).toBe(100);
		expect(view.getFloat32(4, true)).toBe(80);
		expect(view.getUint32(8, true)).toBe(2); // clifford,de-jong,lorenz,thomas → 2
		expect(view.getUint32(12, true)).toBe(attractorsRenderer.stepsPerParticle);
		expect(view.getFloat32(44, true)).toBeGreaterThan(0); // radius
	});

	it('falls back to family index 0 for an unknown attractor', () => {
		expect(pack('bogus').getUint32(8, true)).toBe(0);
	});

	it('declares the workgroup size its integrate entry point uses', () => {
		expect(attractorsRenderer.wgsl).toContain('@workgroup_size(64)');
		expect(attractorsRenderer.wgsl).toContain('fn integrate');
		expect(attractorsRenderer.wgsl).toContain('fn vs');
		expect(attractorsRenderer.wgsl).toContain('fn fs');
	});

	it('Formation traces the orbit: the step count reveals a growing prefix', () => {
		const full = attractorsRenderer.stepsPerParticle;
		expect(pack('lorenz').getUint32(12, true)).toBe(full); // absent → fully formed
		expect(pack('lorenz', 1).getUint32(12, true)).toBe(full);
		expect(pack('lorenz', 0.5).getUint32(12, true)).toBe(Math.round(0.5 * full));
		expect(pack('lorenz', 0).getUint32(12, true)).toBe(1); // a leading point, never blank
	});
});
