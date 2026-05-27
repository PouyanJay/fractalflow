import { describe, it, expect } from 'vitest';
import { interpolateScene, addKeyframe, removeKeyframe, type Keyframe } from './timeline';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { SceneState } from '$lib/engine/types';

const scene = (over: Partial<SceneState>): SceneState => ({ ...createDefaultScene(), ...over });

const A: Keyframe = {
	id: 'a',
	t: 0,
	scene: scene({
		formula: 'mandelbrot',
		camera: { centerX: 0, centerY: 0, scale: 4 },
		maxIter: 200,
		paletteIndex: 0
	})
};
const B: Keyframe = {
	id: 'b',
	t: 1,
	scene: scene({
		formula: 'julia',
		camera: { centerX: 1, centerY: -2, scale: 0.04 },
		maxIter: 600,
		paletteIndex: 2
	})
};

describe('interpolateScene', () => {
	it('returns the endpoints exactly at and beyond the bounds', () => {
		expect(interpolateScene([A, B], 0)).toEqual(A.scene);
		expect(interpolateScene([A, B], 1)).toEqual(B.scene);
		expect(interpolateScene([A, B], -0.5)).toEqual(A.scene); // clamp low
		expect(interpolateScene([A, B], 2)).toEqual(B.scene); // clamp high
	});

	it('lerps camera centre and round-trips maxIter at the midpoint', () => {
		const m = interpolateScene([A, B], 0.5);
		expect(m.camera.centerX).toBeCloseTo(0.5, 10);
		expect(m.camera.centerY).toBeCloseTo(-1, 10);
		expect(m.maxIter).toBe(400);
	});

	it('interpolates zoom geometrically (log-lerp) for a smooth zoom', () => {
		// scale 4 → 0.04 at u=0.5 should be the geometric mean sqrt(4*0.04)=0.4, not 2.02
		expect(interpolateScene([A, B], 0.5).camera.scale).toBeCloseTo(0.4, 10);
	});

	it('snaps discrete fields to the earlier keyframe between nodes', () => {
		expect(interpolateScene([A, B], 0.5).formula).toBe('mandelbrot');
		expect(interpolateScene([A, B], 0.5).paletteIndex).toBe(0);
	});

	it('interpolates the centre in double-double so a deep journey keeps precision', () => {
		// Two centres that f64 sees as identical, differing only in the sub-f64 tail.
		const lo = scene({ camera: { centerX: -0.5, centerY: 0, centerXLo: 0, scale: 1e-12 } });
		const hi = scene({ camera: { centerX: -0.5, centerY: 0, centerXLo: 4e-17, scale: 1e-12 } });
		expect(lo.camera.centerX).toBe(hi.camera.centerX); // f64 can't tell them apart
		const m = interpolateScene(
			[
				{ id: 'l', t: 0, scene: lo },
				{ id: 'h', t: 1, scene: hi }
			],
			0.5
		);
		expect(m.camera.centerXLo).toBeCloseTo(2e-17, 30); // the tail interpolates, not dropped
	});

	it('interpolates bloom amounts so the glow ramps over a journey', () => {
		const lo = scene({ post: { ...createDefaultScene().post, bloom: 0, bloomThreshold: 1 } });
		const hi = scene({ post: { ...createDefaultScene().post, bloom: 1, bloomThreshold: 0.5 } });
		const m = interpolateScene(
			[
				{ id: 'l', t: 0, scene: lo },
				{ id: 'h', t: 1, scene: hi }
			],
			0.5
		);
		expect(m.post.bloom).toBeCloseTo(0.5, 10);
		expect(m.post.bloomThreshold).toBeCloseTo(0.75, 10);
	});

	it('returns the only keyframe for any time when there is one', () => {
		expect(interpolateScene([A], 0.7)).toEqual(A.scene);
	});

	it('is order-independent (sorts by time)', () => {
		expect(interpolateScene([B, A], 0.5).camera.centerX).toBeCloseTo(0.5, 10);
	});

	it('throws when there are no keyframes', () => {
		expect(() => interpolateScene([], 0.5)).toThrow();
	});
});

describe('addKeyframe / removeKeyframe', () => {
	it('adds a keyframe with a unique id and does not mutate the input', () => {
		const list: Keyframe[] = [];
		const next = addKeyframe(list, 0.25, A.scene);
		expect(list).toHaveLength(0);
		expect(next).toHaveLength(1);
		expect(next[0].t).toBe(0.25);
		expect(next[0].id.length).toBeGreaterThan(0);
	});

	it('snapshots the scene so later mutations do not change the keyframe', () => {
		const live = scene({ camera: { centerX: 0, centerY: 0, scale: 3 } });
		const [kf] = addKeyframe([], 0, live);
		// Mutating the source scene (as the live store does on zoom) must not leak in.
		live.camera.scale = 0.001;
		live.formula = 'julia';
		expect(kf.scene.camera.scale).toBe(3);
		expect(kf.scene.formula).toBe('mandelbrot');
	});

	it('removes by id', () => {
		const list = addKeyframe(addKeyframe([], 0, A.scene), 1, B.scene);
		const next = removeKeyframe(list, list[0].id);
		expect(next).toHaveLength(1);
		expect(next[0].id).toBe(list[1].id);
	});
});
