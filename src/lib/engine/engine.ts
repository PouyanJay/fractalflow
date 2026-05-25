/**
 * Engine orchestrator: picks a backend (WebGPU preferred, WebGL2 fallback),
 * owns the canvas drawing-buffer size, and drives the requestAnimationFrame
 * loop. Framework-agnostic — a thin Svelte wrapper mounts it (GpuCanvas).
 */
import type { BackendType, EngineOptions, RenderBackend } from './types';
import { chooseBackendType, detectSupport } from './capabilities';
import { createWebGPUBackend } from './backends/webgpu';
import { createWebGL2Backend } from './backends/webgl2';

const DEFAULT_MAX_DIMENSION = 4096;

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
	canvas: HTMLCanvasElement
): Promise<RenderBackend | null> {
	return type === 'webgpu' ? createWebGPUBackend(canvas) : createWebGL2Backend(canvas);
}

/**
 * Create and initialise an engine on a canvas. Resolves to null if no backend
 * is available, so the caller can show a fallback/error state.
 */
export async function createEngine(
	canvas: HTMLCanvasElement,
	options: EngineOptions = {}
): Promise<Engine | null> {
	const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
	const support = detectSupport();
	const chosen = chooseBackendType(support, options.prefer);
	if (!chosen) return null;

	let backend = await createBackend(chosen, canvas);
	if (!backend) {
		const other: BackendType = chosen === 'webgpu' ? 'webgl2' : 'webgpu';
		backend = await createBackend(other, canvas);
	}
	if (!backend) return null;

	const active = backend;
	options.onBackend?.(active.type);

	const startTime = performance.now();
	let rafId = 0;
	let observer: ResizeObserver | null = null;
	let bufferWidth = 0;
	let bufferHeight = 0;

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
		active.render({
			timeMs: performance.now() - startTime,
			width: bufferWidth,
			height: bufferHeight
		});
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
