import { describe, it, expect } from 'vitest';
import {
	IFS_SYSTEMS,
	getIFS,
	applyAffine,
	chaosGame,
	ifsBounds,
	ifsFraming,
	contractionRatio,
	systemContraction,
	formationMaxDepth,
	formationApprox,
	FORMATION_MIN_DEPTH,
	FORMATION_MAX_DEPTH,
	type IFSystem
} from './ifs';

describe('IFS systems table', () => {
	it('exposes the classic families with unique ids', () => {
		const ids = IFS_SYSTEMS.map((s) => s.id);
		expect(ids).toContain('barnsley-fern');
		expect(ids).toContain('sierpinski-triangle');
		expect(ids).toContain('dragon-curve');
		expect(ids).toContain('koch-curve');
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('every system has at least two maps with positive, summable weights', () => {
		for (const s of IFS_SYSTEMS) {
			expect(s.maps.length).toBeGreaterThanOrEqual(2);
			const total = s.maps.reduce((acc, m) => acc + m.weight, 0);
			expect(total).toBeGreaterThan(0);
			for (const m of s.maps) {
				expect(m.weight).toBeGreaterThan(0);
				expect(m.color).toBeGreaterThanOrEqual(0);
				expect(m.color).toBeLessThanOrEqual(1);
				expect(m.affine).toHaveLength(6);
			}
		}
	});

	it('getIFS resolves a known id and falls back to the first system', () => {
		expect(getIFS('dragon-curve').id).toBe('dragon-curve');
		expect(getIFS('not-a-system').id).toBe(IFS_SYSTEMS[0].id);
	});
});

describe('applyAffine', () => {
	it('maps x = a·x + b·y + c, y = d·x + e·y + f', () => {
		// 90° rotation + translate: [0,-1,1, 1,0,2] takes (1,0) → (1,3).
		expect(applyAffine([0, -1, 1, 1, 0, 2], 1, 0)).toEqual([1, 3]);
	});
});

describe('chaos game', () => {
	it('is deterministic for a given seed', () => {
		const fern = getIFS('barnsley-fern');
		const a = chaosGame(fern, 50, 7);
		const b = chaosGame(fern, 50, 7);
		expect(a[10]).toEqual(b[10]);
		// A different seed traces a different early orbit (same attractor though).
		const c = chaosGame(fern, 50, 8);
		expect(a[10]).not.toEqual(c[10]);
	});

	it('converges the Barnsley fern into its canonical bounding box', () => {
		const fern = getIFS('barnsley-fern');
		const b = ifsBounds(fern);
		// The fern lives in roughly x∈[-2.2, 2.7], y∈[0, 10].
		expect(b.min.x).toBeGreaterThan(-2.8);
		expect(b.max.x).toBeLessThan(2.9);
		expect(b.min.y).toBeGreaterThan(-0.1);
		expect(b.max.y).toBeGreaterThan(8); // it reaches up the frond
		expect(b.max.y).toBeLessThan(10.5);
	});

	it('keeps the Sierpiński triangle inside the unit triangle', () => {
		const sier = getIFS('sierpinski-triangle');
		for (const p of chaosGame(sier, 2000, 3)) {
			expect(p.x).toBeGreaterThan(-0.01);
			expect(p.x).toBeLessThan(1.01);
			expect(p.y).toBeGreaterThan(-0.01);
			expect(p.y).toBeLessThan(0.88);
		}
	});

	it('produces a colour coordinate in [0,1] for every plotted point', () => {
		for (const s of IFS_SYSTEMS) {
			for (const p of chaosGame(s, 200, 1)) {
				expect(p.c).toBeGreaterThanOrEqual(0);
				expect(p.c).toBeLessThanOrEqual(1);
				expect(Number.isFinite(p.x)).toBe(true);
				expect(Number.isFinite(p.y)).toBe(true);
			}
		}
	});

	it('respects map weights: the fern stem map (p≈0.01) is rarely chosen', () => {
		// Count how often the orbit lands on the (degenerate) stem segment x≈0.
		const fern: IFSystem = getIFS('barnsley-fern');
		const pts = chaosGame(fern, 20000, 5);
		const onStem = pts.filter((p) => Math.abs(p.x) < 0.02 && p.y < 1.2).length;
		// Uniform 1/4 selection would put ~25% here; weighted ~1% keeps it sparse.
		expect(onStem / pts.length).toBeLessThan(0.12);
	});
});

describe('contraction ratio', () => {
	it('is the scale factor for a pure-scale map', () => {
		// Sierpiński's three maps are all uniform 0.5 contractions.
		for (const m of getIFS('sierpinski-triangle').maps) {
			expect(contractionRatio(m.affine)).toBeCloseTo(0.5, 6);
		}
	});

	it('captures rotation+scale: the dragon halves distances (1/√2 per axis ⇒ 0.5)', () => {
		// [0.5,-0.5,..,0.5,0.5,..] is a √2-scaled 45° rotation ⇒ singular value √(0.5).
		expect(contractionRatio([0.5, -0.5, 0, 0.5, 0.5, 0])).toBeCloseTo(Math.SQRT1_2, 6);
	});

	it("systemContraction is the slowest map — the fern's 0.85 frond dominates", () => {
		expect(systemContraction(getIFS('barnsley-fern'))).toBeCloseTo(0.851, 2);
		expect(systemContraction(getIFS('sierpinski-triangle'))).toBeCloseTo(0.5, 6);
	});
});

describe('formationMaxDepth', () => {
	it('needs more depth for slow contractions than fast ones', () => {
		const fern = formationMaxDepth(getIFS('barnsley-fern'));
		const sier = formationMaxDepth(getIFS('sierpinski-triangle'));
		expect(fern).toBeGreaterThan(sier); // 0.85 resolves far slower than 0.5
	});

	it('stays within the affordable clamp for every system', () => {
		for (const s of IFS_SYSTEMS) {
			const d = formationMaxDepth(s);
			expect(d).toBeGreaterThanOrEqual(FORMATION_MIN_DEPTH);
			expect(d).toBeLessThanOrEqual(FORMATION_MAX_DEPTH);
			expect(Number.isInteger(d)).toBe(true);
		}
	});
});

describe('formationApprox (depth-d growth)', () => {
	it('at depth 0 is the solid framing box, not yet the attractor', () => {
		const sier = getIFS('sierpinski-triangle');
		const { cx, cy, radius } = ifsFraming(sier);
		const pts = formationApprox(sier, 0, 3000, 11);
		for (const p of pts) {
			expect(Math.abs(p.x - cx)).toBeLessThanOrEqual(radius + 1e-9);
			expect(Math.abs(p.y - cy)).toBeLessThanOrEqual(radius + 1e-9);
		}
		// The box overfills the attractor: points appear below the triangle (y<0).
		expect(pts.some((p) => p.y < -0.02)).toBe(true);
	});

	it('collapses onto the attractor as depth grows', () => {
		const sier = getIFS('sierpinski-triangle');
		const b = ifsBounds(sier);
		const outside = (pts: { x: number; y: number }[]) =>
			pts.filter((p) => p.y < b.min.y - 0.02 || p.y > b.max.y + 0.02).length / pts.length;
		const shallow = outside(formationApprox(sier, 1, 4000, 5));
		const deep = outside(formationApprox(sier, 12, 4000, 5));
		expect(deep).toBeLessThan(shallow);
		expect(deep).toBeLessThan(0.02); // essentially landed on the attractor
	});

	it('is deterministic and yields colour coordinates in [0,1]', () => {
		const a = formationApprox(getIFS('dragon-curve'), 6, 200, 9);
		const b = formationApprox(getIFS('dragon-curve'), 6, 200, 9);
		expect(a[100]).toEqual(b[100]);
		for (const p of a) {
			expect(p.c).toBeGreaterThanOrEqual(0);
			expect(p.c).toBeLessThanOrEqual(1);
			expect(Number.isFinite(p.x)).toBe(true);
			expect(Number.isFinite(p.y)).toBe(true);
		}
	});
});
