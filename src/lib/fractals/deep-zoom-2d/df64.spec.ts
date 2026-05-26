import { describe, it, expect } from 'vitest';
import { splitF32, mulSplitF32 } from './df64';

const f32 = Math.fround;

describe('splitF32', () => {
	it('splits an f64 into f32 hi + lo that reconstruct it far better than f32 alone', () => {
		const v = 0.7853981633974483; // π/4, not representable in f32
		const { hi, lo } = splitF32(v);
		expect(hi).toBe(f32(v)); // hi is the nearest f32
		expect(Math.abs(lo)).toBeLessThan(Math.abs(hi) * 1e-6); // lo is the tiny residual
		// hi + lo recovers ~f64 precision; hi alone is only ~1e-7.
		expect(Math.abs(hi + lo - v)).toBeLessThan(1e-14);
		expect(Math.abs(hi - v)).toBeGreaterThan(1e-9);
	});

	it('handles a representable value with zero residual', () => {
		const { hi, lo } = splitF32(0.5);
		expect(hi).toBe(0.5);
		expect(lo).toBe(0);
	});
});

describe('mulSplitF32 (the shader-mirrored df64×f32 product)', () => {
	it('computes (hi + lo)·b to ~f32 precision, mirroring the shader', () => {
		const Z = -0.7435669; // an O(1) reference-orbit coordinate (f64)
		const delta = f32(3e-6); // a small per-pixel delta (f32)
		const { hi, lo } = splitF32(Z);
		// The op folds the lo·b correction in; over the perturbation loop this keeps
		// the GPU iterating the *correct* reference orbit rather than the orbit of a
		// slightly-wrong point — the real win shows across iterations, not one op.
		expect(mulSplitF32(hi, lo, delta)).toBeCloseTo((hi + lo) * delta, 12);
	});
});
