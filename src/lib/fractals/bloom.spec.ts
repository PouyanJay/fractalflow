import { describe, it, expect } from 'vitest';
import {
	DEFAULT_BLOOM_THRESHOLD,
	DEFAULT_BLOOM_KNEE,
	MAX_BLOOM_MIPS,
	luminance,
	prefilter,
	karisWeight,
	mipLevelCount,
	downsample13,
	upsampleTent
} from './bloom';

/** Bilinear sampler over a constant image — returns the same colour everywhere. */
const constantImage = (c: readonly [number, number, number]) => (): [number, number, number] => [
	c[0],
	c[1],
	c[2]
];

describe('luminance (Rec.709, mirrored in the bloom shaders)', () => {
	it('weights green most and blue least', () => {
		expect(luminance(1, 0, 0)).toBeCloseTo(0.2126, 4);
		expect(luminance(0, 1, 0)).toBeCloseTo(0.7152, 4);
		expect(luminance(0, 0, 1)).toBeCloseTo(0.0722, 4);
	});
	it('white is 1, black is 0', () => {
		expect(luminance(1, 1, 1)).toBeCloseTo(1, 6);
		expect(luminance(0, 0, 0)).toBe(0);
	});
});

describe('prefilter (soft-knee bright pass)', () => {
	it('blacks out colour well below the threshold', () => {
		const [r, g, b] = prefilter([0.2, 0.2, 0.2], 0.8, 0.5);
		expect(r).toBeCloseTo(0, 6);
		expect(g).toBeCloseTo(0, 6);
		expect(b).toBeCloseTo(0, 6);
	});

	it('passes bright colour through, minus the threshold (hard knee)', () => {
		// knee 0 → hard cutoff: contribution = (brightness - threshold) / brightness.
		const [r] = prefilter([1, 0, 0], 0.8, 0); // brightness 1
		expect(r).toBeCloseTo((1 - 0.8) / 1, 5);
	});

	it('is smooth and monotonic across the knee', () => {
		const sample = (v: number) => prefilter([v, v, v], 0.8, 0.5)[0];
		const lo = sample(0.7);
		const mid = sample(0.85);
		const hi = sample(1.0);
		expect(lo).toBeLessThan(mid);
		expect(mid).toBeLessThan(hi);
		expect(lo).toBeGreaterThanOrEqual(0);
	});

	it('never divides by zero on a black pixel', () => {
		expect(prefilter([0, 0, 0], 0.8, 0.5)).toEqual([0, 0, 0]);
	});
});

describe('karisWeight (firefly suppression on the first downsample)', () => {
	it('is 1 for black and falls off with luminance', () => {
		expect(karisWeight(0)).toBeCloseTo(1, 6);
		expect(karisWeight(1)).toBeCloseTo(0.5, 6);
		expect(karisWeight(3)).toBeCloseTo(0.25, 6);
	});
});

describe('mipLevelCount', () => {
	it('grows with resolution and is capped', () => {
		expect(mipLevelCount(1920, 1080)).toBe(MAX_BLOOM_MIPS);
		expect(mipLevelCount(64, 64)).toBe(5); // floor(log2 64) - 1
		expect(mipLevelCount(8, 8)).toBe(2);
	});
	it('never drops below one level, even for tiny buffers', () => {
		expect(mipLevelCount(2, 2)).toBe(1);
		expect(mipLevelCount(1, 1)).toBe(1);
	});
});

describe('downsample13 / upsampleTent (partition of unity → constant-preserving)', () => {
	it('downsample of a constant image returns that constant', () => {
		const out = downsample13(constantImage([0.3, 0.6, 0.9]), 0.5, 0.5, 0.01, 0.01);
		expect(out[0]).toBeCloseTo(0.3, 5);
		expect(out[1]).toBeCloseTo(0.6, 5);
		expect(out[2]).toBeCloseTo(0.9, 5);
	});

	it('upsample of a constant image returns that constant for any radius', () => {
		const out = upsampleTent(constantImage([0.2, 0.4, 0.5]), 0.5, 0.5, 0.01, 0.01, 1.5);
		expect(out[0]).toBeCloseTo(0.2, 5);
		expect(out[1]).toBeCloseTo(0.4, 5);
		expect(out[2]).toBeCloseTo(0.5, 5);
	});
});

describe('bloom defaults', () => {
	it('uses a sensible bright-pass threshold and a mid soft knee', () => {
		expect(DEFAULT_BLOOM_THRESHOLD).toBeGreaterThan(0);
		expect(DEFAULT_BLOOM_THRESHOLD).toBeLessThanOrEqual(1);
		expect(DEFAULT_BLOOM_KNEE).toBeGreaterThan(0);
		expect(DEFAULT_BLOOM_KNEE).toBeLessThanOrEqual(1);
	});
});
