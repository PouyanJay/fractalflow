/**
 * Backend-agnostic rendering contract for the FractalFlow engine.
 *
 * The engine core is framework-free (no Svelte imports). A concrete backend
 * (WebGPU primary, WebGL2 fallback) implements RenderBackend; the orchestrator
 * in engine.ts selects one, drives the frame loop, and handles resizing. A
 * FractalRenderer supplies the shaders + uniform packing for both backends.
 */

export type BackendType = 'webgpu' | 'webgl2';

export interface Camera2D {
	centerX: number;
	centerY: number;
	/** Vertical extent of the view in complex units (smaller = deeper zoom). */
	scale: number;
}

export type FormulaId = 'mandelbrot' | 'julia' | 'burning-ship' | 'tricorn';

/** Mutable per-frame scene state the UI updates and the renderer consumes. */
export interface SceneState {
	formula: FormulaId;
	camera: Camera2D;
	maxIter: number;
	/** Index into the palette presets. */
	paletteIndex: number;
	/** Seed `c` for the Julia formula. */
	juliaSeed: { x: number; y: number };
}

export interface RenderInput {
	/** Drawing-buffer size in device pixels. */
	width: number;
	height: number;
	/** Milliseconds since the engine started. */
	timeMs: number;
	scene: SceneState;
}

/**
 * A pluggable fractal: shader sources for each backend plus a function that
 * packs the current input into a std140-compatible uniform buffer.
 */
export interface FractalRenderer {
	id: string;
	/** WGSL module with `vs`/`fs` entry points and a `Uniforms` at @group(0)@binding(0). */
	wgsl: string;
	/** GLSL ES 300 fragment shader with a std140 `Uniforms` block (engine supplies the vertex stage). */
	glsl: string;
	/** Uniform buffer size in bytes (std140-compatible, multiple of 16). */
	uniformSize: number;
	/** Fill the uniform buffer from the current input. */
	packUniforms(view: DataView, input: RenderInput): void;
}

export interface RenderBackend {
	readonly type: BackendType;
	/** Reconfigure for a new drawing-buffer size (device pixels). */
	resize(width: number, height: number): void;
	/** Draw a single frame. */
	render(input: RenderInput): void;
	/** Release all GPU resources. */
	destroy(): void;
}

export interface EngineOptions {
	/** The fractal to render. */
	renderer: FractalRenderer;
	/** Pulled once per frame so UI edits (pan/zoom/params) take effect live. */
	getScene: () => SceneState;
	/** Preferred backend; the engine falls back to the other if unavailable. */
	prefer?: BackendType;
	/** Cap on drawing-buffer dimension (device pixels) to bound GPU cost. */
	maxDimension?: number;
	/** Called once the engine knows which backend is actually active. */
	onBackend?: (type: BackendType) => void;
}
