import { describe, it, expect, vi } from 'vitest';
import {
	isWebGPUSupported,
	isWebGL2Supported,
	chooseBackendType,
	type BackendSupport
} from './capabilities';

describe('isWebGPUSupported', () => {
	it('is true only when navigator.gpu is present', () => {
		expect(isWebGPUSupported({ gpu: {} })).toBe(true);
		expect(isWebGPUSupported({})).toBe(false);
		expect(isWebGPUSupported({ gpu: undefined })).toBe(false);
	});
});

describe('isWebGL2Supported', () => {
	it('is true when a webgl2 context can be obtained', () => {
		const canvas = { getContext: vi.fn().mockReturnValue({}) };
		expect(isWebGL2Supported(canvas)).toBe(true);
		expect(canvas.getContext).toHaveBeenCalledWith('webgl2');
	});

	it('is false when the context is null', () => {
		expect(isWebGL2Supported({ getContext: () => null })).toBe(false);
	});

	it('is false when getContext throws', () => {
		expect(
			isWebGL2Supported({
				getContext: () => {
					throw new Error('no gl');
				}
			})
		).toBe(false);
	});
});

describe('chooseBackendType', () => {
	const both: BackendSupport = { webgpu: true, webgl2: true };
	const onlyGl: BackendSupport = { webgpu: false, webgl2: true };
	const onlyGpu: BackendSupport = { webgpu: true, webgl2: false };
	const none: BackendSupport = { webgpu: false, webgl2: false };

	it('prefers WebGPU by default', () => {
		expect(chooseBackendType(both)).toBe('webgpu');
	});

	it('falls back to WebGL2 when WebGPU is unavailable', () => {
		expect(chooseBackendType(onlyGl)).toBe('webgl2');
	});

	it('honors an explicit WebGL2 preference', () => {
		expect(chooseBackendType(both, 'webgl2')).toBe('webgl2');
	});

	it('falls back to WebGPU when WebGL2 is preferred but unavailable', () => {
		expect(chooseBackendType(onlyGpu, 'webgl2')).toBe('webgpu');
	});

	it('returns null when nothing is supported', () => {
		expect(chooseBackendType(none)).toBeNull();
	});
});
