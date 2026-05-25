/**
 * Render-mode frame-sequence helpers: turn the Animate timeline into a list of
 * per-frame scenes for export (a zoom movie as a sequence of stills). Pure and
 * framework-free; capture.ts renders the scenes and the Render route zips them.
 */
import { interpolateScene, type Keyframe } from '$lib/animate/timeline';
import type { SceneState } from '$lib/engine/types';

/** Number of frames for a clip of `durationMs` at `fps` (at least one). */
export function frameCountFor(durationMs: number, fps: number): number {
	return Math.max(1, Math.round((durationMs / 1000) * fps));
}

/** The scene at each frame, sampling the timeline evenly across [0,1]. */
export function sequenceScenes(keyframes: readonly Keyframe[], frames: number): SceneState[] {
	const n = Math.max(1, Math.floor(frames));
	const out: SceneState[] = new Array(n);
	for (let i = 0; i < n; i++) {
		out[i] = interpolateScene(keyframes, n <= 1 ? 0 : i / (n - 1));
	}
	return out;
}

/** Zero-padded frame filename so the archive sorts in playback order. */
export function frameFilename(index: number, total: number): string {
	const width = Math.max(4, String(Math.max(0, total - 1)).length);
	return `frame-${String(index).padStart(width, '0')}.png`;
}
