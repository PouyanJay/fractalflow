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
			flame: 'sierpinski',
			post: {
				warp: 'none',
				warpAmount: 6,
				vignette: 0,
				gamma: 1,
				grain: 0,
				bloom: 0,
				bloomThreshold: 0.8,
				bloomKnee: 0.5,
				bloomRadius: 1
			}
		};
		expect(decodeScene(encodeScene(s))).toEqual(s);
	});

	it('round-trips the attractor family, flame and post-processing', () => {
		const s = {
			...createDefaultScene(),
			attractor: 'lorenz',
			flame: 'swirl',
			post: {
				warp: 'kaleido',
				warpAmount: 8,
				vignette: 0.5,
				gamma: 1.4,
				grain: 0.3,
				bloom: 1.2,
				bloomThreshold: 0.65,
				bloomKnee: 0.3,
				bloomRadius: 1.5
			}
		};
		const out = decodeScene(encodeScene(s));
		expect(out.attractor).toBe('lorenz');
		expect(out.flame).toBe('swirl');
		expect(out.post).toEqual(s.post);
	});

	it('defaults post to a no-op for legacy tokens', () => {
		const legacy = encodeScene(createDefaultScene()).split('~').slice(0, 10).join('~');
		expect(decodeScene(legacy).post).toEqual(createDefaultScene().post);
	});

	it('round-trips the extended-precision centre tails (deep-zoom reproducibility)', () => {
		const s = createDefaultScene();
		const deep = {
			...s,
			camera: { centerX: -0.743643887037151, centerY: 0.13182590420533, centerXLo: 1.5e-17, centerYLo: -2.3e-18, scale: 4e-13 }
		};
		const out = decodeScene(encodeScene(deep));
		expect(out.camera.centerXLo).toBe(1.5e-17);
		expect(out.camera.centerYLo).toBe(-2.3e-18);
		expect(out.camera).toEqual(deep.camera);
	});

	it('omits the centre tails for a shallow (f64-only) scene', () => {
		const out = decodeScene(encodeScene(createDefaultScene()));
		expect('centerXLo' in out.camera).toBe(false);
		expect('centerYLo' in out.camera).toBe(false);
	});

	it('defaults bloom for tokens written before bloom existed', () => {
		// A pre-bloom token has the 15 fields up to grain but none of the bloom four.
		const preBloom = encodeScene(createDefaultScene()).split('~').slice(0, 15).join('~');
		const { post } = decodeScene(preBloom);
		expect(post.bloom).toBe(0);
		expect(post.bloomThreshold).toBe(0.8);
		expect(post.bloomKnee).toBe(0.5);
		expect(post.bloomRadius).toBe(1);
	});

	it('clamps out-of-range bloom values defensively', () => {
		const s = createDefaultScene();
		const out = decodeScene(
			encodeScene({
				...s,
				post: { ...s.post, bloom: -3, bloomThreshold: -1, bloomKnee: 5, bloomRadius: -2 }
			})
		);
		expect(out.post.bloom).toBe(0);
		expect(out.post.bloomThreshold).toBe(0);
		expect(out.post.bloomKnee).toBe(1);
		expect(out.post.bloomRadius).toBe(0);
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
		expect(hi.maxIter).toBeLessThanOrEqual(8000);
		expect(hi.paletteIndex).toBeLessThanOrEqual(3);
		const lo = decodeScene(encodeScene({ ...s, maxIter: 1, paletteIndex: -5 }));
		expect(lo.maxIter).toBeGreaterThanOrEqual(1);
		expect(lo.paletteIndex).toBe(0);
	});

	it('falls back to a positive scale when given a non-positive one', () => {
		const s = createDefaultScene();
		expect(
			decodeScene(encodeScene({ ...s, camera: { ...s.camera, scale: 0 } })).camera.scale
		).toBeGreaterThan(0);
	});
});
