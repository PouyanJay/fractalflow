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
import type { Camera2D, SceneState } from '$lib/engine/types';

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
 * The keyframes for a journey of `type` ending at `scene` (the live view).
 *
 *  - Formation: two keyframes — low detail → current — camera fixed.
 *  - Zoom with ≥2 `waypoints`: one keyframe per waypoint (camera path through
 *    them in order), every other scene field taken from the live scene.
 *  - Zoom otherwise: the auto wide→current dive (start 256× wider).
 *
 * The path ends at the current scene/last waypoint, so playing a journey leaves
 * the user where they were.
 */
export function journeyKeyframes(
	type: JourneyType,
	scene: SceneState,
	waypoints: readonly Camera2D[] = []
): Keyframe[] {
	if (type === 'zoom' && waypoints.length >= 2) {
		return waypoints.map((camera, i) => {
			const s = cloneScene(scene);
			s.camera = { ...camera };
			return { id: `journey-wp-${i}`, t: i / (waypoints.length - 1), scene: s };
		});
	}

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
