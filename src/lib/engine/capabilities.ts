/**
 * Pure backend capability detection and selection. Inputs are injected
 * (navigator-like / canvas-like objects) so the logic is unit-testable
 * without a real DOM. Async device acquisition lives in the backends.
 */
import type { BackendType } from './types';

export interface BackendSupport {
	webgpu: boolean;
	webgl2: boolean;
}

/** WebGPU is available when the navigator exposes a `gpu` entry. */
export function isWebGPUSupported(nav: { gpu?: unknown }): boolean {
	return Boolean(nav.gpu);
}

/** WebGL2 is available when a `webgl2` context can be created on a canvas. */
export function isWebGL2Supported(canvas: { getContext(id: string): unknown }): boolean {
	try {
		return canvas.getContext('webgl2') != null;
	} catch {
		return false;
	}
}

/**
 * Choose a backend given what's supported and a soft preference. Tries the
 * preferred type first, then the other; returns null if neither is available.
 */
export function chooseBackendType(
	support: BackendSupport,
	prefer: BackendType = 'webgpu'
): BackendType | null {
	const order: BackendType[] = prefer === 'webgl2' ? ['webgl2', 'webgpu'] : ['webgpu', 'webgl2'];
	for (const type of order) {
		if (support[type]) return type;
	}
	return null;
}

/** Detect support against the live environment (browser only). */
export function detectSupport(): BackendSupport {
	const nav = typeof navigator !== 'undefined' ? navigator : { gpu: undefined };
	let webgl2 = false;
	if (typeof document !== 'undefined') {
		webgl2 = isWebGL2Supported(document.createElement('canvas'));
	}
	return { webgpu: isWebGPUSupported(nav), webgl2 };
}
