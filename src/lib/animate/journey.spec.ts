import { describe, it, expect } from 'vitest';
import { JOURNEYS, journeyKeyframes, FORMATION_START_ITER, ZOOM_JOURNEY_SPAN } from './journey';
import { interpolateScene } from './timeline';
import type { SceneState } from '$lib/engine/types';

const scene: SceneState = {
	formula: 'mandelbrot',
	camera: { centerX: -0.75, centerY: 0.1, scale: 0.004 },
	maxIter: 300,
	paletteIndex: 0,
	juliaSeed: { x: 0, y: 0 },
	attractor: 'clifford',
	flame: 'sierpinski',
	post: { warp: 'none', warpAmount: 0, vignette: 0, gamma: 1, grain: 0 }
};

describe('JOURNEYS', () => {
	it('offers exactly Formation and Zoom, each with a label and blurb', () => {
		expect(JOURNEYS.map((j) => j.id)).toEqual(['formation', 'zoom']);
		for (const j of JOURNEYS) {
			expect(j.label.length).toBeGreaterThan(0);
			expect(j.blurb.length).toBeGreaterThan(0);
		}
	});
});

describe('journeyKeyframes', () => {
	it('always ends at the current scene', () => {
		for (const type of ['formation', 'zoom'] as const) {
			const ks = journeyKeyframes(type, scene);
			expect(ks).toHaveLength(2);
			expect(ks[0].t).toBe(0);
			expect(ks[1].t).toBe(1);
			expect(ks[1].scene).toEqual(scene); // end === current
		}
	});

	it('Formation ramps detail up from the start iteration, camera fixed', () => {
		const [start, end] = journeyKeyframes('formation', scene);
		expect(start.scene.maxIter).toBe(FORMATION_START_ITER);
		expect(start.scene.camera).toEqual(scene.camera); // no camera move
		expect(end.scene.maxIter).toBe(scene.maxIter);
	});

	it('Zoom starts wider and dives to the current view, detail fixed', () => {
		const [start, end] = journeyKeyframes('zoom', scene);
		expect(start.scene.camera.scale).toBeCloseTo(scene.camera.scale * ZOOM_JOURNEY_SPAN);
		expect(start.scene.camera.centerX).toBe(scene.camera.centerX);
		expect(start.scene.maxIter).toBe(scene.maxIter); // no detail ramp
		expect(end.scene.camera.scale).toBeCloseTo(scene.camera.scale);
	});

	it('returns deep clones — mutating a keyframe never touches the input scene', () => {
		const [start] = journeyKeyframes('formation', scene);
		start.scene.maxIter = 999;
		start.scene.camera.scale = 999;
		expect(scene.maxIter).toBe(300);
		expect(scene.camera.scale).toBe(0.004);
	});

	it('interpolates start→current so the journey resolves into the live view', () => {
		const zoom = journeyKeyframes('zoom', scene);
		expect(interpolateScene(zoom, 0).camera.scale).toBeCloseTo(
			scene.camera.scale * ZOOM_JOURNEY_SPAN
		);
		expect(interpolateScene(zoom, 1).camera.scale).toBeCloseTo(scene.camera.scale);
		// Geometric (log) zoom: the midpoint is the geometric mean of the ends.
		const mid = interpolateScene(zoom, 0.5).camera.scale;
		expect(mid).toBeCloseTo(scene.camera.scale * Math.sqrt(ZOOM_JOURNEY_SPAN));
	});
});
