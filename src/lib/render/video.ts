/**
 * Encode a sequence of scenes to a real MP4 (H.264) or WebM (VP9) video via
 * WebCodecs + a muxer — the alternative to the frame-sequence `.zip`. Renders
 * each scene off-screen (mirroring capture.ts), feeds the frames to a
 * `VideoEncoder`, and muxes the chunks into a single Blob.
 *
 * Returns null when WebCodecs or the requested codec is unavailable, so callers
 * fall back to the zip export instead of failing.
 */
import { Muxer as Mp4Muxer, ArrayBufferTarget as Mp4Target } from 'mp4-muxer';
import { Muxer as WebmMuxer, ArrayBufferTarget as WebmTarget } from 'webm-muxer';
import type { FractalRenderer, RenderBackend, SceneState } from '$lib/engine/types';
import { createWebGL2Backend } from '$lib/engine/backends/webgl2';
import { createWebGPUComputeBackend } from '$lib/engine/backends/webgpu-compute';

export type VideoFormat = 'mp4' | 'webm';

interface FormatSpec {
	codec: string;
	mime: string;
	ext: string;
}
const SPECS: Record<VideoFormat, FormatSpec> = {
	mp4: { codec: 'avc1.42001f', mime: 'video/mp4', ext: 'mp4' },
	webm: { codec: 'vp09.00.10.08', mime: 'video/webm', ext: 'webm' }
};

/** Structural view of both muxers (mp4-muxer / webm-muxer share this shape). */
interface VideoMuxer {
	addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
	finalize(): void;
	target: { buffer: ArrayBuffer };
}

/** Whether WebCodecs video encoding is available in this browser. */
export function webCodecsAvailable(): boolean {
	return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

export function videoExtension(format: VideoFormat): string {
	return SPECS[format].ext;
}

const nextFrame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => r()));

function makeMuxer(format: VideoFormat, width: number, height: number, fps: number): VideoMuxer {
	if (format === 'mp4') {
		return new Mp4Muxer({
			target: new Mp4Target(),
			video: { codec: 'avc', width, height },
			fastStart: 'in-memory'
		}) as unknown as VideoMuxer;
	}
	return new WebmMuxer({
		target: new WebmTarget(),
		video: { codec: 'V_VP9', width, height, frameRate: fps }
	}) as unknown as VideoMuxer;
}

/**
 * Render `scenes` to a video Blob, or null if WebCodecs/the codec is
 * unavailable (caller should fall back to the zip export).
 */
export async function encodeVideo(
	renderer: FractalRenderer,
	scenes: readonly SceneState[],
	width: number,
	height: number,
	fps: number,
	format: VideoFormat,
	onProgress?: (done: number, total: number) => void
): Promise<Blob | null> {
	if (!webCodecsAvailable() || scenes.length === 0) return null;

	const bitrate = Math.min(
		40_000_000,
		Math.max(2_000_000, Math.round(width * height * fps * 0.07))
	);
	const config: VideoEncoderConfig = {
		codec: SPECS[format].codec,
		width,
		height,
		bitrate,
		framerate: fps
	};
	const support = await VideoEncoder.isConfigSupported(config).catch(() => null);
	if (!support?.supported) return null;

	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const compute = renderer.pipeline === 'compute';
	const backend: RenderBackend | null = compute
		? await createWebGPUComputeBackend(canvas, renderer)
		: createWebGL2Backend(canvas, renderer, { preserveDrawingBuffer: true });
	if (!backend) return null;
	backend.resize(width, height);

	const muxer = makeMuxer(format, width, height, fps);
	let failed = false;
	const encoder = new VideoEncoder({
		output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
		error: () => (failed = true)
	});
	encoder.configure(config);

	try {
		const frameDur = 1e6 / fps; // microseconds
		for (let i = 0; i < scenes.length && !failed; i++) {
			backend.render({ width, height, timeMs: 0, scene: scenes[i] });
			// Compute styles present after a couple of frames; let the GPU settle.
			if (compute) {
				await nextFrame();
				await nextFrame();
			}
			const frame = new VideoFrame(canvas, {
				timestamp: Math.round(i * frameDur),
				duration: Math.round(frameDur)
			});
			encoder.encode(frame, { keyFrame: i % fps === 0 });
			frame.close();
			onProgress?.(i + 1, scenes.length);
			// Don't let the encode queue grow unbounded for long clips.
			if (encoder.encodeQueueSize > 8) await nextFrame();
		}
		await encoder.flush();
		if (failed) return null;
		muxer.finalize();
		return new Blob([muxer.target.buffer], { type: SPECS[format].mime });
	} catch {
		return null;
	} finally {
		if (encoder.state !== 'closed') encoder.close();
		backend.destroy();
	}
}
