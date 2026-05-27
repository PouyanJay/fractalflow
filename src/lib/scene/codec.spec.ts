import { describe, it, expect } from 'vitest';
import { encodeScene, decodeScene } from './codec';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import { PALETTES } from '$lib/fractals/palette';
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
			camera: {
				centerX: -0.743643887037151,
				centerY: 0.13182590420533,
				centerXLo: 1.5e-17,
				centerYLo: -2.3e-18,
				scale: 4e-13
			}
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

describe('compact tokens (trim defaults, drop shallow precision tails)', () => {
	it('emits only formula + camera for a shallow scene whose other fields are default', () => {
		const s: SceneState = {
			...createDefaultScene(),
			camera: {
				centerX: -0.6381594168889282,
				centerY: 0.07978790907858527,
				scale: 2.727272727272782
			}
		};
		const token = encodeScene(s);
		// maxIter/palette/seed/post all default → omitted; just the 4 meaningful fields.
		expect(token).toBe('mandelbrot~-0.6381594168889282~0.07978790907858527~2.727272727272782');
		expect(decodeScene(token)).toEqual(s);
	});

	it('collapses the all-default (home) scene to a single field', () => {
		expect(encodeScene(createDefaultScene())).toBe('mandelbrot');
	});

	it('drops spurious double-double tails at shallow zoom (render-invariant)', () => {
		// Panning/zooming accumulates a tiny DD tail far below f64 ULP; at shallow
		// zoom it cannot affect the render, so it must not bloat the token.
		const s: SceneState = {
			...createDefaultScene(),
			camera: {
				centerX: -0.6381594168889282,
				centerY: 0.07978790907858527,
				scale: 2.727272727272782,
				centerXLo: 9.339385276425916e-18,
				centerYLo: -5.4631507515534236e-18
			}
		};
		const token = encodeScene(s);
		expect(token.split('~')).toHaveLength(4); // no trailing lo fields
		const out = decodeScene(token);
		expect('centerXLo' in out.camera).toBe(false);
		expect('centerYLo' in out.camera).toBe(false);
	});

	it('keeps the precision tails when the zoom is genuinely deep', () => {
		const s: SceneState = {
			...createDefaultScene(),
			camera: {
				centerX: -0.743643887037151,
				centerY: 0.13182590420533,
				scale: 4e-13,
				centerXLo: 1.5e-17,
				centerYLo: -2.3e-18
			}
		};
		const out = decodeScene(encodeScene(s));
		expect(out.camera.centerXLo).toBe(1.5e-17);
		expect(out.camera.centerYLo).toBe(-2.3e-18);
	});

	it('round-trips the Geometric 3D shape, and omits it when default', () => {
		const s = createDefaultScene();
		expect(decodeScene(encodeScene({ ...s, geometricShape: 'menger' })).geometricShape).toBe(
			'menger'
		);
		expect(
			decodeScene(encodeScene({ ...s, geometricShape: 'quaternion-julia' })).geometricShape
		).toBe('quaternion-julia');
		// Default (mandelbulb) is trimmed and decodes as undefined.
		expect(decodeScene(encodeScene(s)).geometricShape).toBeUndefined();
		expect(
			decodeScene(encodeScene({ ...s, geometricShape: 'mandelbulb' })).geometricShape
		).toBeUndefined();
	});

	it('round-trips an inline custom palette, and omits it when absent', () => {
		const s = createDefaultScene();
		const coeffs = {
			a: [0.4, 0.5, 0.6] as [number, number, number],
			b: [0.3, 0.5, 0.2] as [number, number, number],
			c: [1, 2, 1.5] as [number, number, number],
			d: [0.1, 0.4, 0.7] as [number, number, number]
		};
		const out = decodeScene(encodeScene({ ...s, paletteCoeffs: coeffs }));
		expect(out.paletteCoeffs).toEqual(coeffs);
		// Absent by default → not carried, decodes as undefined.
		expect(decodeScene(encodeScene(s)).paletteCoeffs).toBeUndefined();
		// Survives alongside a Multibrot power and deep-zoom lo-tails.
		const combo = decodeScene(
			encodeScene({
				...s,
				formula: 'multibrot',
				power: 3,
				paletteCoeffs: coeffs,
				camera: { centerX: -0.5, centerY: 0, scale: 1e-12, centerXLo: 1e-17, centerYLo: 0 }
			})
		);
		expect(combo.power).toBe(3);
		expect(combo.paletteCoeffs).toEqual(coeffs);
		expect(combo.camera.centerXLo).toBe(1e-17);
	});

	it('round-trips the Multibrot power, and omits it when default (2)', () => {
		const s = createDefaultScene();
		// Non-default power is carried and restored.
		const withPower = encodeScene({ ...s, formula: 'multibrot', power: 4.5 });
		expect(decodeScene(withPower).power).toBe(4.5);
		// Default power (2) is trimmed away and decodes as absent.
		const defaultPower = encodeScene({ ...s, formula: 'multibrot', power: 2 });
		expect(decodeScene(defaultPower).power).toBeUndefined();
		// A power set on a deeply-zoomed scene survives alongside the lo tails.
		const deep = encodeScene({
			...s,
			formula: 'multibrot',
			power: 3,
			camera: { centerX: -0.5, centerY: 0, scale: 1e-12, centerXLo: 1e-17, centerYLo: 2e-18 }
		});
		const back = decodeScene(deep);
		expect(back.power).toBe(3);
		expect(back.camera.centerXLo).toBe(1e-17);
	});

	it('decodes a trimmed token, filling the omitted fields with defaults', () => {
		const out = decodeScene('julia~0.1~-0.2~0.5');
		const d = createDefaultScene();
		expect(out.formula).toBe('julia');
		expect(out.camera).toEqual({ centerX: 0.1, centerY: -0.2, scale: 0.5 });
		expect(out.maxIter).toBe(d.maxIter);
		expect(out.juliaSeed).toEqual(d.juliaSeed);
		expect(out.post).toEqual(d.post);
	});

	it('still decodes a full legacy 21-field token (backward compatible)', () => {
		const legacy = [
			'julia',
			'-0.5',
			'0.1',
			'1.7e-8',
			'900',
			'2',
			'-0.8',
			'0.156',
			'clifford',
			'sierpinski',
			'kaleido',
			'8',
			'0.5',
			'1.4',
			'0.3',
			'1.2',
			'0.65',
			'0.3',
			'1.5',
			'0',
			'0'
		].join('~');
		const out = decodeScene(legacy);
		expect(out.formula).toBe('julia');
		expect(out.maxIter).toBe(900);
		expect(out.post.warp).toBe('kaleido');
		expect(out.post.bloom).toBe(1.2);
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
		expect(hi.paletteIndex).toBeLessThanOrEqual(PALETTES.length - 1);
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
