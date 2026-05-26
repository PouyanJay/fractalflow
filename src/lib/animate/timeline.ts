/**
 * Animate-mode keyframe model. A timeline is a list of keyframes, each pinning a
 * full Scene at a normalised time t ∈ [0,1]. `interpolateScene` produces the
 * scene at any t by blending the bracketing keyframes: numeric fields lerp,
 * zoom (camera.scale) interpolates geometrically so an "infinite zoom" feels
 * linear in magnification, and discrete fields (formula/family/flame/palette)
 * snap to the earlier keyframe. Pure and framework-free so it's trivially
 * testable; the store and timeline UI build on top.
 */
import type { SceneState } from '$lib/engine/types';

export interface Keyframe {
	id: string;
	/** Normalised position on the timeline, 0..1. */
	t: number;
	scene: SceneState;
}

const lerp = (a: number, b: number, u: number): number => a + (b - a) * u;
/** Geometric interpolation for zoom: constant magnification rate. */
const logLerp = (a: number, b: number, u: number): number =>
	a > 0 && b > 0 ? a * Math.pow(b / a, u) : lerp(a, b, u);

function blend(a: SceneState, b: SceneState, u: number): SceneState {
	return {
		// Discrete fields snap to the earlier keyframe.
		formula: a.formula,
		paletteIndex: a.paletteIndex,
		attractor: a.attractor,
		flame: a.flame,
		// Numeric fields interpolate.
		camera: {
			centerX: lerp(a.camera.centerX, b.camera.centerX, u),
			centerY: lerp(a.camera.centerY, b.camera.centerY, u),
			scale: logLerp(a.camera.scale, b.camera.scale, u)
		},
		maxIter: Math.round(lerp(a.maxIter, b.maxIter, u)),
		juliaSeed: {
			x: lerp(a.juliaSeed.x, b.juliaSeed.x, u),
			y: lerp(a.juliaSeed.y, b.juliaSeed.y, u)
		},
		// Warp snaps to the earlier keyframe; the grade amounts interpolate.
		post: {
			warp: a.post.warp,
			warpAmount: lerp(a.post.warpAmount, b.post.warpAmount, u),
			vignette: lerp(a.post.vignette, b.post.vignette, u),
			gamma: lerp(a.post.gamma, b.post.gamma, u),
			grain: lerp(a.post.grain, b.post.grain, u)
		}
	};
}

/** The scene at time `t`, blending the keyframes that bracket it. */
export function interpolateScene(keyframes: readonly Keyframe[], t: number): SceneState {
	if (keyframes.length === 0) throw new Error('interpolateScene: no keyframes');
	const ks = [...keyframes].sort((a, b) => a.t - b.t);
	if (t <= ks[0].t) return ks[0].scene;
	const last = ks[ks.length - 1];
	if (t >= last.t) return last.scene;

	let i = 0;
	while (i < ks.length - 1 && ks[i + 1].t < t) i++;
	const lo = ks[i];
	const hi = ks[i + 1];
	const span = hi.t - lo.t;
	const u = span > 0 ? (t - lo.t) / span : 0;
	return blend(lo.scene, hi.scene, u);
}

let counter = 0;
const newId = (): string => `kf-${Date.now().toString(36)}-${(counter++).toString(36)}`;

/** Deep copy so a keyframe is a snapshot, not a live reference to the scene store. */
export function cloneScene(scene: SceneState): SceneState {
	return {
		formula: scene.formula,
		camera: { ...scene.camera },
		maxIter: scene.maxIter,
		paletteIndex: scene.paletteIndex,
		juliaSeed: { ...scene.juliaSeed },
		attractor: scene.attractor,
		flame: scene.flame,
		post: { ...scene.post }
	};
}

/** Append a keyframe at time `t` capturing a snapshot of `scene`. Immutable. */
export function addKeyframe(list: readonly Keyframe[], t: number, scene: SceneState): Keyframe[] {
	return [...list, { id: newId(), t: Math.max(0, Math.min(1, t)), scene: cloneScene(scene) }];
}

export function removeKeyframe(list: readonly Keyframe[], id: string): Keyframe[] {
	return list.filter((k) => k.id !== id);
}
