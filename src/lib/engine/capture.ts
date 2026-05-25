/**
 * Export the current scene to a high-resolution PNG. Renders the fractal once
 * to an off-screen WebGL2 canvas (preserveDrawingBuffer so it's readable) and
 * reads it back via toBlob — reliable across browsers and identical math to the
 * live view. WebGL2 is used for capture even when the live view runs on WebGPU.
 */
import type { ComputeRenderer, FractalRenderer, RenderBackend, SceneState } from './types';
import { createWebGL2Backend } from './backends/webgl2';
import { createWebGPUComputeBackend } from './backends/webgpu-compute';

export interface ExportSize {
	id: string;
	label: string;
	width: number;
	height: number;
}

export const EXPORT_SIZES: ExportSize[] = [
	{ id: 'hd', label: 'HD · 1280 × 720', width: 1280, height: 720 },
	{ id: 'fhd', label: 'Full HD · 1920 × 1080', width: 1920, height: 1080 },
	{ id: 'qhd', label: 'QHD · 2560 × 1440', width: 2560, height: 1440 },
	{ id: 'uhd', label: '4K · 3840 × 2160', width: 3840, height: 2160 }
];

/** A timestamped, formula-tagged filename, e.g. fractalflow-mandelbrot-2026-05-25T01-02-03.png */
export function exportFilename(formula: string, date = new Date()): string {
	const stamp = date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
	return `fractalflow-${formula}-${stamp}.png`;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

/**
 * Render the scene off-screen at width×height and return a PNG blob (or null).
 * Fragment renderers capture via an off-screen WebGL2 context (preserved
 * drawing buffer); compute renderers (WebGPU-only) capture via the WebGPU
 * compute backend. Returns null if the required backend is unavailable.
 */
export async function captureScene(
	renderer: FractalRenderer,
	scene: SceneState,
	width: number,
	height: number
): Promise<Blob | null> {
	if (renderer.pipeline === 'compute') return captureCompute(renderer, scene, width, height);

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const backend = createWebGL2Backend(canvas, renderer, { preserveDrawingBuffer: true });
	if (!backend) return null;

	backend.resize(width, height);
	backend.render({ width, height, timeMs: 0, scene });

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	backend.destroy();
	return blob;
}

async function captureCompute(
	renderer: ComputeRenderer,
	scene: SceneState,
	width: number,
	height: number
): Promise<Blob | null> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const backend = await createWebGPUComputeBackend(canvas, renderer);
	if (!backend) return null;

	backend.resize(width, height);
	backend.render({ width, height, timeMs: 0, scene });
	// Let the GPU finish the compute + tone-map passes and present before readback.
	await nextFrame();
	await nextFrame();

	const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
	backend.destroy();
	return blob;
}

/**
 * Render a list of scenes (e.g. an animation's frames) to PNG blobs, reusing a
 * single off-screen backend. Reports progress per frame. Returns null if the
 * backend is unavailable (compute styles need WebGPU).
 */
export async function captureSequence(
	renderer: FractalRenderer,
	scenes: readonly SceneState[],
	width: number,
	height: number,
	onProgress?: (done: number, total: number) => void
): Promise<Blob[] | null> {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;

	const compute = renderer.pipeline === 'compute';
	let backend: RenderBackend | null;
	if (renderer.pipeline === 'compute') {
		backend = await createWebGPUComputeBackend(canvas, renderer);
	} else {
		backend = createWebGL2Backend(canvas, renderer, { preserveDrawingBuffer: true });
	}
	if (!backend) return null;

	backend.resize(width, height);
	const blobs: Blob[] = [];
	for (let i = 0; i < scenes.length; i++) {
		backend.render({ width, height, timeMs: 0, scene: scenes[i] });
		if (compute) {
			await nextFrame();
			await nextFrame();
		}
		const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
		if (!blob) {
			backend.destroy();
			return null;
		}
		blobs.push(blob);
		onProgress?.(i + 1, scenes.length);
	}
	backend.destroy();
	return blobs;
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
	const url = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	link.remove();
	URL.revokeObjectURL(url);
}
