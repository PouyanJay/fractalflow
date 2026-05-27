import { describe, it, expect } from 'vitest';
import { describeScene, nearestLandmark, LANDMARKS } from './codex';
import type { SceneState } from '$lib/engine/types';

function sceneAt(formula: SceneState['formula'], centerX: number, centerY: number): SceneState {
	return {
		formula,
		camera: { centerX, centerY, scale: 0.02 },
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
			bloom: 0,
			bloomThreshold: 0.8,
			bloomKnee: 0.5,
			bloomRadius: 1
		}
	};
}

describe('describeScene', () => {
	it('describes each Deep-Zoom formula by name', () => {
		expect(describeScene('deep-zoom-2d', sceneAt('mandelbrot', 0, 0)).title).toBe('Mandelbrot');
		expect(describeScene('deep-zoom-2d', sceneAt('julia', 0, 0)).title).toBe('Julia set');
		expect(describeScene('deep-zoom-2d', sceneAt('burning-ship', 0, 0)).title).toBe('Burning Ship');
		for (const f of ['mandelbrot', 'julia', 'burning-ship'] as const) {
			expect(describeScene('deep-zoom-2d', sceneAt(f, 0, 0)).body.length).toBeGreaterThan(20);
		}
	});

	it('describes the other art styles by family', () => {
		expect(describeScene('attractors', sceneAt('mandelbrot', 0, 0)).title).toMatch(/Attractor/i);
		expect(describeScene('flames', sceneAt('mandelbrot', 0, 0)).title).toMatch(/Flame/i);
		expect(describeScene('geometric-3d', sceneAt('mandelbrot', 0, 0)).title).toMatch(/Mandelbulb/i);
		expect(describeScene('ifs', sceneAt('mandelbrot', 0, 0)).title).toMatch(/Iterated/i);
	});

	it('falls back to a generic description when no style is selected', () => {
		expect(describeScene(null, sceneAt('mandelbrot', 0, 0)).body.length).toBeGreaterThan(0);
	});
});

describe('nearestLandmark', () => {
	it('names a famous region when the view sits inside it (Mandelbrot only)', () => {
		expect(nearestLandmark('deep-zoom-2d', sceneAt('mandelbrot', -0.745, 0.113))?.label).toBe(
			'Seahorse Valley'
		);
		expect(nearestLandmark('deep-zoom-2d', sceneAt('mandelbrot', 0.275, 0.006))?.label).toBe(
			'Elephant Valley'
		);
	});

	it('returns null out in the open sea (e.g. the home view)', () => {
		expect(nearestLandmark('deep-zoom-2d', sceneAt('mandelbrot', 0, 0))).toBeNull();
	});

	it('only applies to the Mandelbrot — not Julia, not other art styles', () => {
		expect(nearestLandmark('deep-zoom-2d', sceneAt('julia', -0.745, 0.113))).toBeNull();
		expect(nearestLandmark('attractors', sceneAt('mandelbrot', -0.745, 0.113))).toBeNull();
	});

	it('every landmark has a label, center and positive radius', () => {
		expect(LANDMARKS.length).toBeGreaterThan(2);
		for (const l of LANDMARKS) {
			expect(l.label.length).toBeGreaterThan(0);
			expect(l.radius).toBeGreaterThan(0);
		}
	});
});
