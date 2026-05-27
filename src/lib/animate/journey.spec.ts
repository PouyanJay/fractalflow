import { describe, it, expect } from 'vitest';
import {
	JOURNEYS,
	journeyKeyframes,
	FORMATION_START_ITER,
	SHOWCASE_DIVES,
	MIN_DIVE_FACTOR,
	DIVE_PAN_FRACTION
} from './journey';
import { interpolateScene } from './timeline';
import type { SceneState } from '$lib/engine/types';

const scene: SceneState = {
	formula: 'mandelbrot',
	camera: { centerX: -0.5, centerY: 0, scale: 3 },
	maxIter: 300,
	paletteIndex: 0,
	juliaSeed: { x: 0, y: 0 },
	attractor: 'clifford',
	flame: 'sierpinski',
	ifs: 'barnsley-fern',
	post: {
		warp: 'none',
		warpAmount: 0,
		vignette: 0,
		gamma: 1,
		grain: 0,
		hueShift: 0,
		saturation: 1,
		bloom: 0,
		bloomThreshold: 0.8,
		bloomKnee: 0.5,
		bloomRadius: 1
	}
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

describe('SHOWCASE_DIVES', () => {
	it('has a deep, finite destination for every 2D formula', () => {
		for (const formula of [
			'mandelbrot',
			'julia',
			'burning-ship',
			'tricorn',
			'lyapunov',
			'apollonian'
		] as const) {
			const t = SHOWCASE_DIVES[formula];
			expect(Number.isFinite(t.centerX)).toBe(true);
			expect(Number.isFinite(t.centerY)).toBe(true);
			expect(t.scale).toBeGreaterThan(0);
			expect(t.scale).toBeLessThan(scene.camera.scale); // genuinely zoomed in
		}
	});
});

describe('journeyKeyframes — Formation', () => {
	it('ramps detail up from the start iteration, camera fixed, ends at current', () => {
		const ks = journeyKeyframes('formation', scene);
		expect(ks).toHaveLength(2);
		const [start, end] = ks;
		expect(start.t).toBe(0);
		expect(end.t).toBe(1);
		expect(start.scene.maxIter).toBe(FORMATION_START_ITER);
		expect(start.scene.camera).toEqual(scene.camera); // no camera move
		expect(end.scene).toEqual(scene); // ends at current
	});

	it('ignores waypoints (camera stays fixed)', () => {
		const ks = journeyKeyframes('formation', scene, [
			{ centerX: 9, centerY: 9, scale: 9 },
			{ centerX: 1, centerY: 1, scale: 1 }
		]);
		expect(ks).toHaveLength(2);
		expect(ks[0].scene.camera).toEqual(scene.camera);
	});
});

describe('journeyKeyframes — auto Zoom dive (no waypoints)', () => {
	it('starts at the live view, then dives INWARD to the curated beauty spot', () => {
		const ks = journeyKeyframes('zoom', scene);
		const start = ks[0];
		const end = ks[ks.length - 1];
		const target = SHOWCASE_DIVES.mandelbrot;

		// Opens on exactly where the user is.
		expect(start.t).toBe(0);
		expect(start.scene.camera).toEqual(scene.camera);

		// Ends deep inside the curated destination (not pulled out, not the live view).
		expect(end.t).toBe(1);
		expect(end.scene.camera.centerX).toBe(target.centerX);
		expect(end.scene.camera.centerY).toBe(target.centerY);
		expect(end.scene.camera.scale).toBeLessThan(start.scene.camera.scale);
		expect(end.scene.camera.scale).toBeCloseTo(target.scale);
	});

	it('pins the destination dead-centre before diving (no deep-zoom drift)', () => {
		const ks = journeyKeyframes('zoom', scene);
		expect(ks.length).toBeGreaterThanOrEqual(3);
		const pan = ks.find((k) => k.t === DIVE_PAN_FRACTION);
		const target = SHOWCASE_DIVES.mandelbrot;
		expect(pan).toBeDefined();
		// Pan stop: target centred while still at the opening (wide) zoom.
		expect(pan!.scene.camera.centerX).toBe(target.centerX);
		expect(pan!.scene.camera.centerY).toBe(target.centerY);
		expect(pan!.scene.camera.scale).toBeCloseTo(scene.camera.scale);
	});

	it('keeps detail fixed across the dive (deep zoom auto-lifts iterations itself)', () => {
		const ks = journeyKeyframes('zoom', scene);
		for (const k of ks) expect(k.scene.maxIter).toBe(scene.maxIter);
	});

	it('always travels inward even from a view deeper than the curated target', () => {
		const deep: SceneState = { ...scene, camera: { centerX: -0.74, centerY: 0.13, scale: 1e-9 } };
		const ks = journeyKeyframes('zoom', deep);
		const end = ks[ks.length - 1].scene.camera.scale;
		expect(end).toBeLessThan(deep.camera.scale); // still dives in, never pulls out
		expect(end).toBeCloseTo(deep.camera.scale / MIN_DIVE_FACTOR);
	});

	it('picks the destination for the active formula', () => {
		const ship: SceneState = { ...scene, formula: 'burning-ship' };
		const end = journeyKeyframes('zoom', ship).at(-1)!.scene.camera;
		expect(end.centerX).toBe(SHOWCASE_DIVES['burning-ship'].centerX);
		expect(end.centerY).toBe(SHOWCASE_DIVES['burning-ship'].centerY);
	});

	it('falls back to the dive when given a single waypoint', () => {
		const ks = journeyKeyframes('zoom', scene, [{ centerX: 1, centerY: 1, scale: 1 }]);
		const end = ks.at(-1)!.scene.camera;
		expect(end.centerX).toBe(SHOWCASE_DIVES.mandelbrot.centerX);
		expect(end.scale).toBeLessThan(scene.camera.scale);
	});

	it('for non-deep-zoom styles, dives into the current view without panning', () => {
		const ks = journeyKeyframes('zoom', scene, [], 'attractors');
		expect(ks).toHaveLength(2);
		expect(ks[0].scene.camera).toEqual(scene.camera);
		expect(ks[1].scene.camera.centerX).toBe(scene.camera.centerX); // no pan — centre is orientation
		expect(ks[1].scene.camera.centerY).toBe(scene.camera.centerY);
		expect(ks[1].scene.camera.scale).toBeLessThan(scene.camera.scale);
	});
});

describe('journeyKeyframes — multi-waypoint Zoom', () => {
	it('flies through ≥2 waypoints in order, other fields from the live scene', () => {
		const waypoints = [
			{ centerX: 0, centerY: 0, scale: 3 },
			{ centerX: -0.5, centerY: 0.1, scale: 0.1 },
			{ centerX: -0.745, centerY: 0.113, scale: 0.0008 }
		];
		const ks = journeyKeyframes('zoom', scene, waypoints);
		expect(ks).toHaveLength(3);
		expect(ks.map((k) => k.t)).toEqual([0, 0.5, 1]);
		expect(ks[0].scene.camera).toEqual(waypoints[0]);
		expect(ks[2].scene.camera).toEqual(waypoints[2]);
		expect(ks[1].scene.maxIter).toBe(scene.maxIter);
	});
});

describe('journeyKeyframes — purity', () => {
	it('returns deep clones — mutating a keyframe never touches the input scene', () => {
		const [start] = journeyKeyframes('formation', scene);
		start.scene.maxIter = 999;
		start.scene.camera.scale = 999;
		expect(scene.maxIter).toBe(300);
		expect(scene.camera.scale).toBe(3);
	});
});

describe('interpolated auto dive', () => {
	it('opens on the live view and lands deep inside the destination', () => {
		const ks = journeyKeyframes('zoom', scene);
		const target = SHOWCASE_DIVES.mandelbrot;
		expect(interpolateScene(ks, 0).camera.scale).toBeCloseTo(scene.camera.scale);
		const landing = interpolateScene(ks, 1).camera;
		expect(landing.scale).toBeCloseTo(target.scale);
		expect(landing.centerX).toBeCloseTo(target.centerX);
	});

	it('keeps the destination centred throughout the diving segment', () => {
		const ks = journeyKeyframes('zoom', scene);
		const target = SHOWCASE_DIVES.mandelbrot;
		// Sample inside the zoom segment (after the pan completes).
		for (const t of [0.5, 0.8, 0.95]) {
			const c = interpolateScene(ks, t).camera;
			expect(c.centerX).toBeCloseTo(target.centerX, 6);
			expect(c.centerY).toBeCloseTo(target.centerY, 6);
		}
	});
});
