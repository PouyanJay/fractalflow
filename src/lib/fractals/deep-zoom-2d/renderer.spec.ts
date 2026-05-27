import { describe, it, expect } from 'vitest';
import {
	autoMaxIter,
	effectiveMaxIter,
	createDefaultScene,
	mandelbrotRenderer,
	UNIFORM_SIZE
} from './renderer';
import type { RenderInput, SceneState } from '$lib/engine/types';

/** Read the series-skip field (offset 136) out of a freshly packed uniform buffer. */
function packedSkip(scene: SceneState, width = 800, height = 600): number {
	const buf = new ArrayBuffer(UNIFORM_SIZE);
	const view = new DataView(buf);
	const input: RenderInput = { width, height, timeMs: 0, scene };
	mandelbrotRenderer.packUniforms(view, input);
	return view.getFloat32(136, true);
}

describe('autoMaxIter (zoom-derived iteration floor)', () => {
	it('is 0 at and around the home view, so the manual slider rules when shallow', () => {
		expect(autoMaxIter(3)).toBe(0); // 1× zoom
		expect(autoMaxIter(0.03)).toBe(0); // 100× — still shallow
	});

	it('climbs with zoom depth', () => {
		const z1e6 = autoMaxIter(3e-6);
		const z1e9 = autoMaxIter(3e-9);
		const z1e12 = autoMaxIter(3e-12);
		expect(z1e6).toBeGreaterThan(800);
		expect(z1e9).toBeGreaterThan(z1e6);
		expect(z1e12).toBeGreaterThan(z1e9);
	});

	it('never exceeds the iteration cap, even at absurd depth', () => {
		expect(autoMaxIter(3e-40)).toBeLessThanOrEqual(8000);
		expect(autoMaxIter(3e-40)).toBe(8000);
	});
});

describe('effectiveMaxIter (manual setting floored by the zoom curve)', () => {
	it('equals the manual value when shallow', () => {
		const s = createDefaultScene(); // scale 3, maxIter 300
		expect(effectiveMaxIter(s)).toBe(300);
	});

	it('lifts a low manual value at deep zoom so the view still resolves', () => {
		const s = {
			...createDefaultScene(),
			maxIter: 300,
			camera: { centerX: -0.5, centerY: 0, scale: 3e-9 }
		};
		expect(effectiveMaxIter(s)).toBe(autoMaxIter(3e-9));
		expect(effectiveMaxIter(s)).toBeGreaterThan(300);
	});

	it('keeps a high manual value above the floor', () => {
		const s = {
			...createDefaultScene(),
			maxIter: 8000,
			camera: { centerX: -0.5, centerY: 0, scale: 3e-6 }
		};
		expect(effectiveMaxIter(s)).toBe(8000);
	});
});

describe('series-approximation skip in the packed uniforms', () => {
	const deepCenter = { centerX: -0.743643887037151, centerY: 0.13182590420533 };

	it('uniform buffer is std140-aligned (multiple of 16 bytes)', () => {
		expect(UNIFORM_SIZE % 16).toBe(0);
	});

	it('packs a positive skip for a deep Mandelbrot view', () => {
		const scene: SceneState = { ...createDefaultScene(), camera: { ...deepCenter, scale: 3e-9 } };
		expect(packedSkip(scene)).toBeGreaterThan(0);
	});

	it('packs no skip when the view is shallow (home view)', () => {
		expect(packedSkip(createDefaultScene())).toBe(0);
	});

	it('packs no skip for the non-analytic Burning Ship even at depth', () => {
		const scene: SceneState = {
			...createDefaultScene(),
			formula: 'burning-ship',
			camera: { ...deepCenter, scale: 3e-9 }
		};
		expect(packedSkip(scene)).toBe(0);
	});
});
