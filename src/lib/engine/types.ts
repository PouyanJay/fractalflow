/**
 * Backend-agnostic rendering contract for the Fractal Studio engine.
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
	/**
	 * Extended-precision tail of the centre (double-double `lo` part). f64 alone
	 * runs out of digits past ~1e10× zoom, placing the deep-zoom reference orbit
	 * at slightly the wrong point; `centerX`/`centerY` are the `hi` parts and
	 * these the `lo`. Optional and default 0, so a plain f64 centre is exact and
	 * existing scenes are unaffected. See $lib/fractals/deep-zoom-2d/dd.
	 */
	centerXLo?: number;
	centerYLo?: number;
	/** Vertical extent of the view in complex units (smaller = deeper zoom). */
	scale: number;
}

/** Coloring algorithm for the Deep-Zoom 2D escape-time renderer. */
export type ColoringId = 'smooth' | 'orbit-trap' | 'distance' | 'domain' | 'interior';

/** The raymarched shape for the Geometric 3D renderer. */
export type GeometricShapeId =
	| 'mandelbulb'
	| 'mandelbox'
	| 'menger'
	| 'juliabulb'
	| 'quaternion-julia';

export type FormulaId =
	| 'mandelbrot'
	| 'julia'
	| 'burning-ship'
	| 'tricorn'
	| 'celtic'
	| 'buffalo'
	| 'perpendicular'
	| 'perpendicular-ship'
	| 'celtic-mandelbar'
	| 'multibrot'
	| 'newton'
	| 'phoenix'
	| 'lyapunov'
	| 'apollonian';

/** Screen-space post-processing applied at the end of every renderer. */
export interface PostSettings {
	/** Coordinate warp id ('none'|'kaleido'|'mirror'|'swirl'|'ripple'|'fisheye'|'fold'). */
	warp: string;
	warpAmount: number;
	vignette: number;
	gamma: number;
	grain: number;
	/** Hue rotation in turns ([-0.5, 0.5]); 0 leaves colour unchanged. */
	hueShift: number;
	/** Saturation multiplier (0 = greyscale, 1 = unchanged, >1 = boosted). */
	saturation: number;
	/**
	 * Bloom (HDR glow). `bloom` is the intensity; 0 disables it entirely and the
	 * backend keeps its direct-to-swapchain path (no render-to-texture cost).
	 * When > 0 the backend renders the scene to an offscreen target, builds a
	 * downsample/upsample mip pyramid of the bright areas, and adds the glow back
	 * *before* the gamma/vignette/grain grade. See `$lib/fractals/bloom`.
	 */
	bloom: number;
	/** Bright-pass luminance cutoff — only pixels above this contribute glow. */
	bloomThreshold: number;
	/** Soft-knee smoothness of the threshold rolloff (0 = hard, 1 = soft). */
	bloomKnee: number;
	/** Spread of the glow (scales the upsample tent filter radius). */
	bloomRadius: number;
}

/** Mutable per-frame scene state the UI updates and the renderer consumes. */
export interface SceneState {
	formula: FormulaId;
	camera: Camera2D;
	maxIter: number;
	/** Index into the palette presets. */
	paletteIndex: number;
	/** Inline custom cosine-palette coefficients — color = a + b·cos(2π(c·t + d)),
	 * each component [r,g,b]. When present it overrides `paletteIndex`, so a
	 * hand-designed palette travels with the scene (share links stay reproducible).
	 * Optional and absent by default. */
	paletteCoeffs?: {
		a: [number, number, number];
		b: [number, number, number];
		c: [number, number, number];
		d: [number, number, number];
	};
	/** Seed `c` for the Julia formula. */
	juliaSeed: { x: number; y: number };
	/** Exponent `d` for the Multibrot formula (z ← zᵈ + c). Optional and default
	 * 2 (the Mandelbrot), so existing scenes are unaffected; carried for every
	 * scene like juliaSeed but only read by the Multibrot iteration. */
	power?: number;
	/** Strange-attractor family id (Glowing Attractors). Carried for every scene
	 * like juliaSeed, unused unless the attractors renderer is active. */
	attractor: string;
	/** Fractal-flame id (Painterly Flames). Carried like attractor; unused
	 * unless the flames renderer is active. */
	flame: string;
	/** Iterated-function-system id (IFS art style). Carried like attractor;
	 * unused unless the ifs renderer is active. */
	ifs: string;
	/** Screen-space post-processing (warp + grade), edited in Compose. */
	post: PostSettings;
	/** Which raymarched shape the Geometric 3D renderer draws. Optional, default
	 * 'mandelbulb'; carried like the other family selectors, only read in 3D. */
	geometricShape?: GeometricShapeId;
	/** Coloring algorithm for the Deep-Zoom 2D escape-time formulas. Optional,
	 * default 'smooth'; only read by the deep-zoom renderer (codes 0–9). */
	coloring?: ColoringId;
	/**
	 * Formation progress in [0,1]: how fully the fractal has grown into being.
	 * A *transient* animation parameter the Formation journey ramps 0→1 — it is
	 * not part of the artwork's identity, so it is never serialized (a loaded
	 * `.fflow`/share link is always fully formed) and absent means 1. Each
	 * renderer maps it to its own growth lever: Deep-Zoom scales the iteration
	 * count; IFS grows the recursion depth out of a solid seed.
	 */
	formation?: number;
}

export interface RenderInput {
	/** Drawing-buffer size in device pixels. */
	width: number;
	height: number;
	/** Milliseconds since the engine started. */
	timeMs: number;
	scene: SceneState;
	/**
	 * Supersampling grid dimension N (N×N sub-samples per pixel). 1 = off. Only
	 * the Deep-Zoom 2D renderer reads it (its boundaries alias badly without AA);
	 * other renderers ignore it. The engine sets it to 1 while the view is moving
	 * and bumps it for the idle refine pass; export sets it high for crisp stills.
	 */
	aaSamples?: number;
}

/** Fields shared by every renderer regardless of pipeline. */
interface RendererBase {
	id: string;
	/** Interaction model: 2D pan/zoom or 3D orbit/dolly. */
	kind: '2d' | '3d';
	/** WGSL module supplying the entry points for this pipeline. */
	wgsl: string;
	/** Uniform buffer size in bytes (std140-compatible, multiple of 16). */
	uniformSize: number;
	/** Fill the uniform buffer from the current input. */
	packUniforms(view: DataView, input: RenderInput): void;
	/**
	 * When true, the engine renders 1 sample/pixel while the scene is changing
	 * (smooth interaction) and re-renders once with high supersampling after the
	 * view has been idle briefly. Only safe for renderers whose output depends
	 * solely on the scene (not on per-frame time) — i.e. Deep-Zoom 2D.
	 */
	refineOnIdle?: boolean;
}

/**
 * A fragment-pipeline fractal: a fullscreen-triangle shader for each backend.
 * Runs on both WebGPU and WebGL2. The WGSL has `vs`/`fs` entry points and a
 * `Uniforms` at @group(0)@binding(0).
 */
export interface FragmentRenderer extends RendererBase {
	pipeline?: 'fragment';
	/** GLSL ES 300 fragment shader with a std140 `Uniforms` block (engine supplies the vertex stage). */
	glsl: string;
	/**
	 * Optional per-frame data buffer (e.g. a perturbation reference orbit),
	 * exposed to the shader as a storage buffer (WebGPU) / data texture (WebGL2).
	 * `dataBufferSize` is the max byte capacity; `packData` returns this frame's
	 * data (interleaved RG f32, length ≤ capacity).
	 */
	dataBufferSize?: number;
	packData?(input: RenderInput): Float32Array;
}

/**
 * A compute-pipeline fractal: a WebGPU-only particle accumulator. A compute
 * pass integrates `particleCount` particles `stepsPerParticle` steps each,
 * atomically accumulating a density grid; a render pass tone-maps it. The WGSL
 * supplies `integrate` (compute), `vs` and `fs` (tone-map) entry points. No
 * WebGL2 path — the engine shows a "requires WebGPU" state on fallback.
 */
export interface ComputeRenderer extends RendererBase {
	pipeline: 'compute';
	/** Particles seeded per frame. */
	particleCount: number;
	/** Iteration steps each particle walks, accumulating one sample per step. */
	stepsPerParticle: number;
	/**
	 * u32 accumulators per pixel (default 1 = density only). Flames use more to
	 * accumulate colour alongside density; the WGSL must index with the same
	 * stride. The backend sizes and clears the grid accordingly.
	 */
	accumulationChannels?: number;
}

export type FractalRenderer = FragmentRenderer | ComputeRenderer;

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
