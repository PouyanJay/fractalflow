/**
 * Engine orchestrator: picks a backend (WebGPU preferred, WebGL2 fallback),
 * owns the canvas drawing-buffer size, and drives the requestAnimationFrame
 * loop — pulling the live scene each frame. Framework-agnostic; a thin Svelte
 * wrapper mounts it (GpuCanvas).
 */
import type {
	BackendType,
	EngineOptions,
	FractalRenderer,
	RenderBackend,
	SceneState
} from './types';
import { chooseBackendType, detectSupport } from './capabilities';
import { createWebGPUBackend } from './backends/webgpu';
import { createWebGL2Backend } from './backends/webgl2';

const DEFAULT_MAX_DIMENSION = 4096;

/** How long the view must hold still before the high-quality refine pass fires. */
const IDLE_REFINE_MS = 150;
/** Supersampling grid (N×N) used for the idle refine pass. */
const IDLE_AA_SAMPLES = 3;

export interface RefineState {
	/** Signature of the last frame's scene + buffer size. */
	sig: string;
	/** Timestamp (ms) when the signature last changed. */
	changedAt: number;
	/** Whether the high-quality pass has already been drawn for this signature. */
	refined: boolean;
}

export interface FrameDecision {
	render: boolean;
	aaSamples: number;
	state: RefineState;
}

/** Content signature of everything that affects a (time-independent) render. */
export function sceneSignature(scene: SceneState, width: number, height: number): string {
	return `${width}x${height}|${JSON.stringify(scene)}`;
}

/**
 * Decide whether to draw this frame and at what supersampling level. For a
 * renderer that refines on idle: while the signature keeps changing the view is
 * "moving" → draw every frame at 1 sample (smooth interaction). Once it holds
 * still for `idleMs`, draw one high-quality pass at `idleSamples`; afterwards
 * skip redundant draws until the signature changes again. Renderers that don't
 * refine draw every frame at 1 sample (unchanged behaviour). Pure & testable.
 */
export function decideFrame(
	prev: RefineState,
	sig: string,
	now: number,
	opts: { refineOnIdle: boolean; idleMs: number; idleSamples: number }
): FrameDecision {
	if (!opts.refineOnIdle || sig !== prev.sig) {
		return { render: true, aaSamples: 1, state: { sig, changedAt: now, refined: false } };
	}
	if (!prev.refined && now - prev.changedAt >= opts.idleMs) {
		return { render: true, aaSamples: opts.idleSamples, state: { ...prev, refined: true } };
	}
	return { render: false, aaSamples: 1, state: prev };
}

/**
 * Convert a CSS box + device pixel ratio into a clamped, integer drawing-buffer
 * size. Pure so it can be unit-tested without a DOM.
 */
export function computeDrawingBufferSize(
	cssWidth: number,
	cssHeight: number,
	dpr: number,
	maxDimension: number
): { width: number; height: number } {
	const scale = Math.max(dpr, 0.5);
	let width = Math.max(1, Math.floor(cssWidth * scale));
	let height = Math.max(1, Math.floor(cssHeight * scale));
	const longest = Math.max(width, height);
	if (longest > maxDimension) {
		const k = maxDimension / longest;
		width = Math.max(1, Math.floor(width * k));
		height = Math.max(1, Math.floor(height * k));
	}
	return { width, height };
}

export interface Engine {
	readonly backend: BackendType;
	start(): void;
	stop(): void;
	destroy(): void;
}

async function createBackend(
	type: BackendType,
	canvas: HTMLCanvasElement,
	renderer: FractalRenderer
): Promise<RenderBackend | null> {
	return type === 'webgpu'
		? createWebGPUBackend(canvas, renderer)
		: createWebGL2Backend(canvas, renderer);
}

/**
 * Create and initialise an engine on a canvas. Resolves to null if no backend
 * is available, so the caller can show a fallback/error state.
 */
export async function createEngine(
	canvas: HTMLCanvasElement,
	options: EngineOptions
): Promise<Engine | null> {
	const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
	const support = detectSupport();
	const chosen = chooseBackendType(support, options.prefer);
	if (!chosen) return null;

	let backend = await createBackend(chosen, canvas, options.renderer);
	if (!backend) {
		const other: BackendType = chosen === 'webgpu' ? 'webgl2' : 'webgpu';
		backend = await createBackend(other, canvas, options.renderer);
	}
	if (!backend) return null;

	const active = backend;
	options.onBackend?.(active.type);

	const startTime = performance.now();
	let rafId = 0;
	let observer: ResizeObserver | null = null;
	let bufferWidth = 0;
	let bufferHeight = 0;
	let refineState: RefineState = { sig: '', changedAt: 0, refined: false };
	const refineOnIdle = options.renderer.refineOnIdle === true;

	function applySize() {
		const rect = canvas.getBoundingClientRect();
		const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
		const { width, height } = computeDrawingBufferSize(rect.width, rect.height, dpr, maxDimension);
		if (width !== bufferWidth || height !== bufferHeight) {
			bufferWidth = width;
			bufferHeight = height;
			canvas.width = width;
			canvas.height = height;
			active.resize(width, height);
		}
	}

	function frame() {
		applySize();
		const scene = options.getScene();
		const now = performance.now();
		const sig = sceneSignature(scene, bufferWidth, bufferHeight);
		const decision = decideFrame(refineState, sig, now, {
			refineOnIdle,
			idleMs: IDLE_REFINE_MS,
			idleSamples: IDLE_AA_SAMPLES
		});
		refineState = decision.state;
		if (decision.render) {
			active.render({
				timeMs: now - startTime,
				width: bufferWidth,
				height: bufferHeight,
				scene,
				aaSamples: decision.aaSamples
			});
		}
		rafId = requestAnimationFrame(frame);
	}

	function start() {
		if (rafId) return;
		applySize();
		rafId = requestAnimationFrame(frame);
		observer = new ResizeObserver(() => applySize());
		observer.observe(canvas);
	}

	function stop() {
		if (rafId) cancelAnimationFrame(rafId);
		rafId = 0;
		observer?.disconnect();
		observer = null;
	}

	function destroy() {
		stop();
		active.destroy();
	}

	return { backend: active.type, start, stop, destroy };
}
