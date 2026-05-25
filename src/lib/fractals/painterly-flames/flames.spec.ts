import { describe, it, expect } from 'vitest';
import {
	FLAMES,
	getFlame,
	applyAffine,
	VARIATIONS,
	applyTransform,
	chaosGame,
	flameBounds,
	type FlamePoint
} from './flames';

const finite = (p: FlamePoint) => Number.isFinite(p.x) && Number.isFinite(p.y);

describe('applyAffine', () => {
	it('maps a point through the 6-coefficient affine transform', () => {
		expect(applyAffine([1, 0, 0, 0, 1, 0], 3, 4)).toEqual([3, 4]); // identity
		expect(applyAffine([0.5, 0, 0.5, 0, 0.5, 0], 2, 2)).toEqual([1.5, 1]);
	});
});

describe('VARIATIONS (the nonlinear functions, mirrored in WGSL)', () => {
	it('linear is the identity', () => {
		expect(VARIATIONS.linear(3, 4)).toEqual([3, 4]);
	});
	it('sinusoidal takes the sine of each coordinate', () => {
		const [x, y] = VARIATIONS.sinusoidal(Math.PI / 2, 0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
	});
	it('spherical inverts by the squared radius', () => {
		expect(VARIATIONS.spherical(2, 0)[0]).toBeCloseTo(0.5, 10);
		expect(VARIATIONS.spherical(1, 0)[0]).toBeCloseTo(1, 10);
	});
	it('horseshoe is finite at the origin (guarded radius)', () => {
		const [x, y] = VARIATIONS.horseshoe(1, 0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
		expect(finite({ x: VARIATIONS.horseshoe(0, 0)[0], y: 0, c: 0 })).toBe(true);
	});
	it('swirl fixes the origin', () => {
		expect(VARIATIONS.swirl(0, 0)).toEqual([0, 0]);
	});
});

describe('applyTransform', () => {
	it('applies the affine then the variation', () => {
		const t = {
			affine: [1, 0, 0, 0, 1, 0] as const,
			variation: 'sinusoidal' as const,
			color: 0,
			weight: 1
		};
		const [x, y] = applyTransform(t, Math.PI / 2, 0);
		expect(x).toBeCloseTo(1, 10);
		expect(y).toBeCloseTo(0, 10);
	});
});

describe('FLAMES catalog', () => {
	it('lists curated flames with unique ids and well-formed transforms', () => {
		expect(FLAMES.length).toBeGreaterThanOrEqual(3);
		const ids = FLAMES.map((f) => f.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const f of FLAMES) {
			expect(f.label.length).toBeGreaterThan(0);
			expect(f.transforms.length).toBeGreaterThanOrEqual(2);
			for (const t of f.transforms) {
				expect(t.affine).toHaveLength(6);
				expect(t.weight).toBeGreaterThan(0);
				expect(t.color).toBeGreaterThanOrEqual(0);
				expect(t.color).toBeLessThanOrEqual(1);
				expect(t.variation in VARIATIONS).toBe(true);
			}
		}
	});
});

describe('getFlame', () => {
	it('returns the requested flame, falling back to the first for unknown ids', () => {
		expect(getFlame(FLAMES[1].id).id).toBe(FLAMES[1].id);
		expect(getFlame('nope').id).toBe(FLAMES[0].id);
	});
});

describe('chaosGame', () => {
	it('produces the requested count of finite, bounded, deterministic points', () => {
		for (const f of FLAMES) {
			const pts = chaosGame(f, 2000, 1);
			expect(pts).toHaveLength(2000);
			expect(pts.every(finite)).toBe(true);
			expect(pts.every((p) => Math.abs(p.x) < 1e3 && Math.abs(p.y) < 1e3)).toBe(true);
			expect(pts.every((p) => p.c >= 0 && p.c <= 1)).toBe(true);
			// Same seed → identical sequence.
			expect(chaosGame(f, 16, 7)).toEqual(chaosGame(f, 16, 7));
		}
	});
});

describe('flameBounds', () => {
	it('returns finite x/y extents covering the attractor', () => {
		const b = flameBounds(FLAMES[0]);
		expect(Number.isFinite(b.min.x) && Number.isFinite(b.max.x)).toBe(true);
		expect(b.max.x).toBeGreaterThan(b.min.x);
		expect(b.max.y).toBeGreaterThan(b.min.y);
	});
});
