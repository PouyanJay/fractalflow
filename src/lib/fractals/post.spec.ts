import { describe, it, expect } from 'vitest';
import {
	DEFAULT_POST,
	WARPS,
	WARP_CODE,
	POST_SIZE,
	packPost,
	warpMirror,
	warpKaleido,
	type PostSettings
} from './post';

describe('post model', () => {
	it('defaults to a no-op (identity warp, neutral grade, bloom off)', () => {
		expect(DEFAULT_POST.warp).toBe('none');
		expect(DEFAULT_POST.vignette).toBe(0);
		expect(DEFAULT_POST.gamma).toBe(1);
		expect(DEFAULT_POST.grain).toBe(0);
		expect(DEFAULT_POST.bloom).toBe(0);
	});

	it('lists warps with codes that match', () => {
		expect(WARPS.map((w) => w.id)).toEqual(['none', 'kaleido', 'mirror']);
		expect(WARP_CODE.none).toBe(0);
		expect(WARP_CODE.kaleido).toBe(1);
		expect(WARP_CODE.mirror).toBe(2);
	});
});

describe('packPost', () => {
	it('writes the warp code and the grade floats at the given base', () => {
		const view = new DataView(new ArrayBuffer(POST_SIZE + 8));
		const p: PostSettings = {
			warp: 'mirror',
			warpAmount: 8,
			vignette: 0.4,
			gamma: 1.5,
			grain: 0.2,
			bloom: 0,
			bloomThreshold: 0.8,
			bloomKnee: 0.5,
			bloomRadius: 1
		};
		packPost(view, 8, p);
		expect(view.getUint32(8, true)).toBe(2);
		expect(view.getFloat32(12, true)).toBeCloseTo(8);
		expect(view.getFloat32(16, true)).toBeCloseTo(0.4);
		expect(view.getFloat32(20, true)).toBeCloseTo(1.5);
		expect(view.getFloat32(24, true)).toBeCloseTo(0.2);
	});

	it('sets the bloomActive flag only when bloom intensity is positive', () => {
		const view = new DataView(new ArrayBuffer(POST_SIZE));
		const base: PostSettings = {
			warp: 'none',
			warpAmount: 6,
			vignette: 0,
			gamma: 1,
			grain: 0,
			bloom: 0,
			bloomThreshold: 0.8,
			bloomKnee: 0.5,
			bloomRadius: 1
		};
		packPost(view, 0, base);
		expect(view.getFloat32(20, true)).toBe(0);
		packPost(view, 0, { ...base, bloom: 0.7 });
		expect(view.getFloat32(20, true)).toBe(1);
	});

	it('is a multiple of 16 bytes for std140 alignment', () => {
		expect(POST_SIZE % 16).toBe(0);
	});
});

describe('warp functions (CPU reference, mirrored in the shaders)', () => {
	it('mirror folds x to the positive half-plane', () => {
		expect(warpMirror(-3, 4)).toEqual([3, 4]);
		expect(warpMirror(3, 4)).toEqual([3, 4]);
	});

	it('kaleidoscope preserves radius and folds into a wedge', () => {
		const [x, y] = warpKaleido(-0.6, 0.8, 6); // radius 1
		expect(Math.hypot(x, y)).toBeCloseTo(1, 10);
		const ang = Math.atan2(y, x);
		expect(ang).toBeGreaterThanOrEqual(-1e-9);
		expect(ang).toBeLessThanOrEqual(Math.PI / 6 + 1e-9); // within one half-segment
	});

	it('kaleidoscope is deterministic', () => {
		expect(warpKaleido(0.3, -0.7, 5)).toEqual(warpKaleido(0.3, -0.7, 5));
	});
});
