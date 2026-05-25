import { describe, it, expect } from 'vitest';
import { createWebGPUBackend } from './webgpu';
import { mandelbrotRenderer } from '$lib/fractals/deep-zoom-2d/renderer';

describe('createWebGPUBackend', () => {
	it('resolves to null when WebGPU is unavailable in the environment', async () => {
		const canvas = {} as unknown as HTMLCanvasElement;
		await expect(createWebGPUBackend(canvas, mandelbrotRenderer)).resolves.toBeNull();
	});
});
