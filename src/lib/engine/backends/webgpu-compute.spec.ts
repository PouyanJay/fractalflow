import { describe, it, expect } from 'vitest';
import { createWebGPUComputeBackend, COMPUTE_WORKGROUP_SIZE } from './webgpu-compute';
import type { ComputeRenderer } from '$lib/engine/types';

const fixture: ComputeRenderer = {
	id: 'test',
	kind: '3d',
	pipeline: 'compute',
	wgsl: '',
	uniformSize: 16,
	packUniforms: () => {},
	particleCount: 1024,
	stepsPerParticle: 64
};

describe('createWebGPUComputeBackend', () => {
	it('resolves to null when WebGPU is unavailable in the environment', async () => {
		const canvas = {} as unknown as HTMLCanvasElement;
		await expect(createWebGPUComputeBackend(canvas, fixture)).resolves.toBeNull();
	});

	it('exposes the workgroup size the integrate entry point must declare', () => {
		expect(COMPUTE_WORKGROUP_SIZE).toBeGreaterThan(0);
	});
});
