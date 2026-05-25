import { describe, it, expect } from 'vitest';
import { encodeScene, decodeScene } from './codec';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { SceneState } from '$lib/engine/types';

describe('encodeScene / decodeScene round-trip', () => {
	it('restores the default scene exactly', () => {
		const s = createDefaultScene();
		expect(decodeScene(encodeScene(s))).toEqual(s);
	});

	it('preserves a deep-zoom Julia scene at full f64 precision', () => {
		const s: SceneState = {
			formula: 'julia',
			camera: { centerX: -0.743643887037151, centerY: 0.13182590420533, scale: 1.7e-8 },
			maxIter: 900,
			paletteIndex: 2,
			juliaSeed: { x: -0.8, y: 0.156 },
			attractor: 'clifford',
			flame: 'sierpinski'
		};
		expect(decodeScene(encodeScene(s))).toEqual(s);
	});

	it('round-trips the selected attractor family and flame', () => {
		const s = { ...createDefaultScene(), attractor: 'lorenz', flame: 'swirl' };
		const out = decodeScene(encodeScene(s));
		expect(out.attractor).toBe('lorenz');
		expect(out.flame).toBe('swirl');
	});
});

describe('decodeScene resilience', () => {
	it('falls back to the default scene on garbage input', () => {
		const d = createDefaultScene();
		expect(decodeScene('')).toEqual(d);
		expect(decodeScene('not~a~scene')).toEqual(d);
	});

	it('rejects an unknown formula', () => {
		const s = createDefaultScene();
		const token = encodeScene({ ...s, formula: 'julia' }).replace('julia', 'bogus');
		expect(decodeScene(token).formula).toBe('mandelbrot');
	});

	it('defaults the attractor family and flame for legacy tokens and unknown ids', () => {
		// A pre-attractor token has only the original 8 fields.
		const legacy = encodeScene(createDefaultScene()).split('~').slice(0, 8).join('~');
		expect(decodeScene(legacy).attractor).toBe('clifford');
		expect(decodeScene(legacy).flame).toBe('sierpinski');
		const bogus = encodeScene({ ...createDefaultScene(), attractor: 'nope', flame: 'nope' });
		expect(decodeScene(bogus).attractor).toBe('clifford');
		expect(decodeScene(bogus).flame).toBe('sierpinski');
	});

	it('clamps maxIter and paletteIndex into range', () => {
		const s = createDefaultScene();
		const hi = decodeScene(encodeScene({ ...s, maxIter: 999999, paletteIndex: 999 }));
		expect(hi.maxIter).toBeLessThanOrEqual(1200);
		expect(hi.paletteIndex).toBeLessThanOrEqual(3);
		const lo = decodeScene(encodeScene({ ...s, maxIter: 1, paletteIndex: -5 }));
		expect(lo.maxIter).toBeGreaterThanOrEqual(50);
		expect(lo.paletteIndex).toBe(0);
	});

	it('falls back to a positive scale when given a non-positive one', () => {
		const s = createDefaultScene();
		expect(
			decodeScene(encodeScene({ ...s, camera: { ...s.camera, scale: 0 } })).camera.scale
		).toBeGreaterThan(0);
	});
});
