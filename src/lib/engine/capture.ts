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

/**
 * A filename tag describing the active subject: the formula for Deep-Zoom 2D,
 * the named variant for attractors/flames, otherwise the style id. Pure so it's
 * shared by every export surface and unit-tested.
 */
export function exportTagFor(
	style: string | null,
	scene: { formula: string; attractor: string; flame: string; ifs: string }
): string {
	if (style === 'deep-zoom-2d') return scene.formula;
	if (style === 'attractors') return `attractor-${scene.attractor}`;
	if (style === 'flames') return `flame-${scene.flame}`;
	if (style === 'ifs') return `ifs-${scene.ifs}`;
	return style ?? 'fractal';
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

/** One layer to composite: a resolved renderer + its scene, blend and opacity. */
export interface CaptureLayer {
	renderer: FractalRenderer | null;
	scene: SceneState;
	/** Blend-mode id (a CSS mix-blend-mode value); 'normal' → source-over. */
	blend: string;
	opacity: number;
	visible: boolean;
}

/** Map a layer blend id to a 2D-canvas globalCompositeOperation. */
function compositeOp(blend: string): GlobalCompositeOperation {
	return blend === 'normal' ? 'source-over' : (blend as GlobalCompositeOperation);
}

/**
 * Composite a multi-layer document to a single PNG, mirroring the Explore
 * viewport: each visible layer is rendered off-screen, then drawn onto a 2D
 * canvas with its blend mode (globalCompositeOperation) and opacity, bottom →
 * top. Returns null if nothing could be rendered.
 */
export async function captureLayers(
	layers: readonly CaptureLayer[],
	width: number,
	height: number
): Promise<Blob | null> {
	const out = document.createElement('canvas');
	out.width = width;
	out.height = height;
	const ctx = out.getContext('2d');
	if (!ctx) return null;
	let drewAny = false;
	for (const layer of layers) {
		if (!layer.visible || !layer.renderer) continue;
		// A compute-style layer (attractors/flames/IFS) needs WebGPU; if it's
		// unavailable here, captureScene returns null and we skip that layer —
		// the same graceful degradation as the live "needs WebGPU" viewport state.
		const blob = await captureScene(layer.renderer, layer.scene, width, height);
		if (!blob) continue;
		const bitmap = await createImageBitmap(blob);
		ctx.globalCompositeOperation = compositeOp(layer.blend);
		ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
		ctx.drawImage(bitmap, 0, 0);
		bitmap.close();
		drewAny = true;
	}
	ctx.globalCompositeOperation = 'source-over';
	ctx.globalAlpha = 1;
	if (!drewAny) return null;
	return new Promise<Blob | null>((resolve) => out.toBlob(resolve, 'image/png'));
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
