/**
 * Curated "journeys" — the two cinematic ways to experience a scene in Explore.
 * Each reduces to a short keyframe clip the shared timeline interpolator
 * animates, so playback and Movie export both build on the tested
 * interpolation/sequence engine. Pure and framework-free.
 *
 *  - Formation: detail/iterations ramp up from almost nothing, so the fractal
 *    resolves into being (for attractors/flames this brightens the accumulated
 *    density; for Deep-Zoom/Geometric it sharpens the structure).
 *  - Zoom: with no waypoints, a curated showcase dive — from the live view
 *    *into* a hand-picked beautiful spot for the chosen fractal, ending deep
 *    inside it. With ≥2 waypoints, the camera flies through them in order.
 */
import { cloneScene, type Keyframe } from './timeline';
import type { Camera2D, FormulaId, SceneState } from '$lib/engine/types';
import type { ArtStyleId } from '$lib/stores/ui-logic';

export type JourneyType = 'formation' | 'zoom';

export interface JourneyMeta {
	id: JourneyType;
	label: string;
	blurb: string;
}

export const JOURNEYS: readonly JourneyMeta[] = [
	{ id: 'formation', label: 'Formation', blurb: 'Watch the fractal resolve into being.' },
	{ id: 'zoom', label: 'Zoom', blurb: 'Dive into a beautiful corner of the fractal.' }
] as const;

/** Detail/iteration count a Formation journey starts from before ramping up. */
export const FORMATION_START_ITER = 1;

/** Destination of an auto Zoom dive: a centre to pin and a depth to reach. */
export interface DiveTarget {
	centerX: number;
	centerY: number;
	/** Vertical view extent (smaller = deeper); the dive ends here. */
	scale: number;
}

/**
 * Hand-picked, known-beautiful deep destinations for the auto Zoom dive, one per
 * 2D formula. Each is a spot whose neighbourhood is endlessly intricate, so the
 * dive lands somewhere worth seeing rather than in a flat interior.
 */
export const SHOWCASE_DIVES: Record<FormulaId, DiveTarget> = {
	// Seahorse Valley's near-self-similar point — endless spirals fill the frame
	// at any depth; ~3×10⁷ in lands on a full-frame double spiral.
	mandelbrot: { centerX: -0.743643887037151, centerY: 0.13182590420533, scale: 1e-7 },
	// The origin is the densest, most ornate region of a connected Julia set, so
	// it reads beautifully across seeds rather than only one.
	julia: { centerX: 0, centerY: 0, scale: 0.02 },
	// Into the "rigging" of the main Burning Ship hull — its signature masts/arches.
	'burning-ship': { centerX: -1.775, centerY: -0.035, scale: 0.02 },
	// The faceted antennae crowning the Tricorn's left-arm bulb.
	tricorn: { centerX: -1.402, centerY: 0, scale: 0.02 },
	// Abs-variant destinations — each chosen for a full-frame stretch of boundary
	// "dust" / mini-set filigree (found by scoring views for balanced detail).
	celtic: { centerX: -0.75, centerY: 1.05, scale: 0.04 },
	buffalo: { centerX: -0.5, centerY: -1.3, scale: 0.02 },
	perpendicular: { centerX: 0.32, centerY: 0.06, scale: 0.08 },
	'perpendicular-ship': { centerX: -0.65, centerY: 0.65, scale: 0.02 },
	'celtic-mandelbar': { centerX: -0.2, centerY: 0.75, scale: 0.04 },
	// Multibrot: Seahorse Valley (gorgeous at the default power 2; stays within the
	// f32 direct-iteration range since Multibrot has no perturbation path).
	multibrot: { centerX: -0.745, centerY: 0.113, scale: 0.012 }
};

/**
 * Floor on how much deeper an auto Zoom dive ends versus where it began, so the
 * dive always travels *inward* — even when the user is already deeper than the
 * curated target, it pushes a further `MIN_DIVE_FACTOR×` in rather than pulling
 * the camera back out.
 */
export const MIN_DIVE_FACTOR = 1000;

/** Gentler inward factor for non-2D styles, where the centre is orientation. */
export const NON_2D_DIVE_FACTOR = 6;

/**
 * Fraction of the dive spent gliding the destination to screen-centre while the
 * view is still wide. Doing the pan up-front (then holding the centre fixed
 * through the zoom) keeps the target pinned dead-centre, avoiding the drift a
 * naive linear pan suffers once the view is deep.
 */
export const DIVE_PAN_FRACTION = 0.15;

/** A keyframe centred on `target`'s coordinates at view extent `scale`. */
function atTarget(scene: SceneState, target: DiveTarget, scale: number): SceneState {
	const s = cloneScene(scene);
	s.camera = {
		...s.camera,
		centerX: target.centerX,
		centerXLo: 0,
		centerY: target.centerY,
		centerYLo: 0,
		scale
	};
	return s;
}

/** The curated dive from the live view into the chosen fractal's beauty spot. */
function showcaseDive(scene: SceneState, styleId?: ArtStyleId): Keyframe[] {
	const cur = scene.camera;
	const start: Keyframe = { id: 'journey-start', t: 0, scene: cloneScene(scene) };

	// Non-deep-zoom styles: the camera centre is orientation/framing, not a place
	// on a plane, so we can't pan to a fixed coordinate — just dolly inward.
	if (styleId != null && styleId !== 'deep-zoom-2d') {
		const end = cloneScene(scene);
		end.camera = { ...cur, scale: cur.scale / NON_2D_DIVE_FACTOR };
		return [start, { id: 'journey-end', t: 1, scene: end }];
	}

	const target = SHOWCASE_DIVES[scene.formula];
	// End at the curated depth, but never shallower than MIN_DIVE_FACTOR past the
	// current view — guarantees inward travel from any starting depth.
	const endScale = Math.min(target.scale, cur.scale / MIN_DIVE_FACTOR);

	return [
		start,
		// Glide the beauty spot to centre while still wide…
		{ id: 'journey-pan', t: DIVE_PAN_FRACTION, scene: atTarget(scene, target, cur.scale) },
		// …then dive straight in, the target pinned dead-centre the whole way.
		{ id: 'journey-end', t: 1, scene: atTarget(scene, target, endScale) }
	];
}

/**
 * The keyframes for a journey of `type` ending in the scene to be shown.
 *
 *  - Formation: two keyframes — low detail → current — camera fixed.
 *  - Zoom with ≥2 `waypoints`: one keyframe per waypoint (camera path through
 *    them in order), every other scene field taken from the live scene.
 *  - Zoom otherwise: the curated showcase dive from the live view into a
 *    beautiful deep spot for the active formula (see `SHOWCASE_DIVES`).
 *
 * `styleId` lets the dive adapt to non-2D art styles, where the camera centre
 * is orientation rather than a coordinate to pan toward.
 */
export function journeyKeyframes(
	type: JourneyType,
	scene: SceneState,
	waypoints: readonly Camera2D[] = [],
	styleId?: ArtStyleId
): Keyframe[] {
	if (type === 'zoom') {
		if (waypoints.length >= 2) {
			return waypoints.map((camera, i) => {
				const s = cloneScene(scene);
				s.camera = { ...camera };
				return { id: `journey-wp-${i}`, t: i / (waypoints.length - 1), scene: s };
			});
		}
		return showcaseDive(scene, styleId);
	}

	const start = cloneScene(scene);
	const end = cloneScene(scene);
	start.maxIter = Math.min(FORMATION_START_ITER, scene.maxIter);
	return [
		{ id: 'journey-start', t: 0, scene: start },
		{ id: 'journey-end', t: 1, scene: end }
	];
}
