import { describe, it, expect } from 'vitest';
import {
	DEFAULT_POST,
	WARPS,
	WARP_CODE,
	POST_SIZE,
	packPost,
	warpMirror,
	warpKaleido,
	warpSwirl,
	warpRipple,
	warpFisheye,
	warpFold,
	warpDefaultAmount,
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

	it('defaults the grade additions to a no-op (no hue rotation, full saturation)', () => {
		expect(DEFAULT_POST.hueShift).toBe(0);
		expect(DEFAULT_POST.saturation).toBe(1);
	});

	it('lists warps with codes that match', () => {
		expect(WARPS.map((w) => w.id)).toEqual([
			'none',
			'kaleido',
			'mirror',
			'swirl',
			'ripple',
			'fisheye',
			'fold'
		]);
		expect(WARP_CODE.none).toBe(0);
		expect(WARP_CODE.kaleido).toBe(1);
		expect(WARP_CODE.mirror).toBe(2);
		expect(WARP_CODE.swirl).toBe(3);
		expect(WARP_CODE.ripple).toBe(4);
		expect(WARP_CODE.fisheye).toBe(5);
		expect(WARP_CODE.fold).toBe(6);
	});

	it('gives every amount-taking warp a default in its declared range', () => {
		for (const w of WARPS) {
			if (!w.amount) continue;
			const d = warpDefaultAmount(w.id);
			expect(d).toBeGreaterThanOrEqual(w.amount.min);
			expect(d).toBeLessThanOrEqual(w.amount.max);
		}
	});
});

describe('warp CPU references', () => {
	it('swirl preserves radius and reduces to a rotation at the origin', () => {
		const [x, y] = warpSwirl(1, 0, 4);
		expect(Math.hypot(x, y)).toBeCloseTo(1); // radius preserved
		expect(warpSwirl(0, 0, 4)).toEqual([0, 0]);
	});
	it('ripple is the identity at zero frequency phase and scales radially', () => {
		const [x, y] = warpRipple(1, 1, 9);
		// radial scale keeps the direction
		expect(Math.atan2(y, x)).toBeCloseTo(Math.PI / 4);
	});
	it('fisheye power 1 is the identity; >1 pushes outward past the unit circle', () => {
		expect(warpFisheye(0.5, 0.5, 1).map((v) => +v.toFixed(6))).toEqual([0.5, 0.5]);
		const [x, y] = warpFisheye(2, 0, 1.6); // r=2 → 2^1.6 ≈ 3.03
		expect(x).toBeGreaterThan(2);
		expect(y).toBeCloseTo(0);
	});
	it('fold maps the whole plane into one wedge (angle within [0, 2π/n))', () => {
		const seg = (2 * Math.PI) / 6;
		for (const [x, y] of [
			[-1, 0],
			[0, -1],
			[0.5, -0.5]
		]) {
			const [fx, fy] = warpFold(x, y, 6);
			let a = Math.atan2(fy, fx);
			if (a < -1e-9) a += 2 * Math.PI;
			expect(a).toBeGreaterThanOrEqual(-1e-6);
			expect(a).toBeLessThan(seg + 1e-6);
			expect(Math.hypot(fx, fy)).toBeCloseTo(Math.hypot(x, y)); // radius preserved
		}
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
			hueShift: 0,
			saturation: 1,
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
			hueShift: 0,
			saturation: 1,
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
