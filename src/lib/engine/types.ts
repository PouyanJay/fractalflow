/**
 * Backend-agnostic rendering contract for the FractalFlow engine.
 *
 * The engine core is framework-free (no Svelte imports). A concrete backend
 * (WebGPU primary, WebGL2 fallback) implements RenderBackend; the orchestrator
 * in engine.ts selects one, drives the frame loop, and handles resizing.
 */

export type BackendType = 'webgpu' | 'webgl2';

/** Per-frame inputs handed to a backend's render(). Grows as renderers land. */
export interface FrameState {
	/** Milliseconds since the engine started — drives any time-based motion. */
	timeMs: number;
	/** Drawing-buffer size in device pixels. */
	width: number;
	height: number;
}

export interface RenderBackend {
	readonly type: BackendType;
	/** Resize the drawing buffer / reconfigure the swap chain (device pixels). */
	resize(width: number, height: number): void;
	/** Draw a single frame. */
	render(frame: FrameState): void;
	/** Release all GPU resources. */
	destroy(): void;
}

export interface EngineOptions {
	/** Preferred backend; the engine falls back to the other if unavailable. */
	prefer?: BackendType;
	/** Cap on drawing-buffer dimension (device pixels) to bound GPU cost. */
	maxDimension?: number;
	/** Called once the engine knows which backend is actually active. */
	onBackend?: (type: BackendType) => void;
}
