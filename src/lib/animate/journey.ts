/**
 * Curated "journeys" — the two cinematic ways to experience a scene in Explore.
 * Each reduces to a two-keyframe clip (a start state → the current scene) that
 * the shared timeline interpolator animates, so playback and Movie export both
 * build on the tested interpolation/sequence engine. Pure and framework-free.
 *
 *  - Formation: detail/iterations ramp up from almost nothing, so the fractal
 *    resolves into being (for attractors/flames this brightens the accumulated
 *    density; for Deep-Zoom/Geometric it sharpens the structure).
 *  - Zoom: the camera starts wider and dives geometrically into the current
 *    view — the classic "infinite zoom" toward where you are.
 */
import { cloneScene, type Keyframe } from './timeline';
import type { SceneState } from '$lib/engine/types';

export type JourneyType = 'formation' | 'zoom';

export interface JourneyMeta {
	id: JourneyType;
	label: string;
	blurb: string;
}

export const JOURNEYS: readonly JourneyMeta[] = [
	{ id: 'formation', label: 'Formation', blurb: 'Watch the fractal resolve into being.' },
	{ id: 'zoom', label: 'Zoom', blurb: 'Dive smoothly into the current view.' }
] as const;

/** Detail/iteration count a Formation journey starts from before ramping up. */
export const FORMATION_START_ITER = 1;
/** A Zoom journey starts this many× wider than the current view, then dives in. */
export const ZOOM_JOURNEY_SPAN = 256;

/**
 * The two keyframes for a journey of `type` ending at `scene` (the live view).
 * The end keyframe is the current scene, so playing a journey returns to where
 * the user was.
 */
export function journeyKeyframes(type: JourneyType, scene: SceneState): Keyframe[] {
	const start = cloneScene(scene);
	const end = cloneScene(scene);
	if (type === 'formation') {
		start.maxIter = Math.min(FORMATION_START_ITER, scene.maxIter);
	} else {
		start.camera = { ...start.camera, scale: scene.camera.scale * ZOOM_JOURNEY_SPAN };
	}
	return [
		{ id: 'journey-start', t: 0, scene: start },
		{ id: 'journey-end', t: 1, scene: end }
	];
}
