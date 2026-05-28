import { describe, it, expect } from 'vitest';
import {
	IFS_SYSTEMS,
	getIFS,
	applyAffine,
	chaosGame,
	ifsBounds,
	convexHull,
	ifsHull,
	pointInConvex,
	contractionRatio,
	systemContraction,
	formationMaxDepth,
	formationApprox,
	FORMATION_MIN_DEPTH,
	FORMATION_MAX_DEPTH,
	HULL_MAX,
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

const shoelace = (h: { x: number; y: number }[]) => {
	let a = 0;
	for (let i = 0; i < h.length; i++) {
		const p = h[i];
		const q = h[(i + 1) % h.length];
		a += p.x * q.y - q.x * p.y;
	}
	return Math.abs(a) / 2;
};

describe('convex hull seeding', () => {
	it('hulls the Sierpiński attractor to a tight triangle silhouette', () => {
		const hull = ifsHull(getIFS('sierpinski-triangle'));
		expect(hull.length).toBeLessThanOrEqual(4); // a triangle, not a jagged ~16-gon
		// Area ≈ the ideal unit triangle (½·1·√3/2 ≈ 0.433), far below its 1.08²
		// bounding square — proof it's the silhouette, not the box.
		expect(shoelace(hull)).toBeGreaterThan(0.34);
		expect(shoelace(hull)).toBeLessThan(0.5);
	});

	it('keeps every hull within the vertex cap', () => {
		for (const s of IFS_SYSTEMS) expect(ifsHull(s).length).toBeLessThanOrEqual(HULL_MAX);
	});

	it('convexHull winds CCW and pointInConvex agrees with inside/outside', () => {
		const square = convexHull([
			{ x: 0, y: 0 },
			{ x: 1, y: 0 },
			{ x: 1, y: 1 },
			{ x: 0, y: 1 },
			{ x: 0.5, y: 0.5 } // interior point excluded from the hull
		]);
		expect(square.length).toBe(4);
		expect(pointInConvex(square, 0.5, 0.5)).toBe(true);
		expect(pointInConvex(square, 1.5, 0.5)).toBe(false);
	});
});

describe('formationApprox (depth-d growth)', () => {
	it('at depth 0 fills the attractor silhouette (the triangle), not the square corners', () => {
		const sier = getIFS('sierpinski-triangle');
		const hull = ifsHull(sier);
		const pts = formationApprox(sier, 0, 3000, 11);
		// Seeds land inside the triangular hull, so none sit below the base (y<0)
		// the way a square seed's corners would.
		const slack = 0.03;
		for (const p of pts) expect(pointInConvex(hull, p.x, p.y) || p.y > -slack).toBe(true);
		expect(pts.every((p) => p.y > -slack)).toBe(true); // triangle, not square
	});

	it('carves the central hole as depth grows (the gasket forming)', () => {
		const sier = getIFS('sierpinski-triangle');
		// The Sierpiński hole is the medial triangle around (0.5, 0.289).
		const nearHole = (pts: { x: number; y: number }[]) =>
			pts.filter((p) => Math.hypot(p.x - 0.5, p.y - 0.289) < 0.12).length / pts.length;
		const shallow = nearHole(formationApprox(sier, 0, 4000, 5)); // the filled triangle
		const deep = nearHole(formationApprox(sier, 8, 4000, 5));
		expect(shallow).toBeGreaterThan(0.02); // depth 0 fills the centre
		expect(deep).toBeLessThan(shallow);
		expect(deep).toBeLessThan(0.005); // the gasket has emptied its central hole
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
