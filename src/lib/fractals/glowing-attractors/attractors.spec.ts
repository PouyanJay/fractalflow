import { describe, it, expect } from 'vitest';
import { ATTRACTORS, getAttractor, orbit, boundsOf, type Vec3 } from './attractors';

const finite = (p: Vec3) => Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);

describe('ATTRACTORS catalog', () => {
	it('lists the four families with unique ids and labels', () => {
		const ids = ATTRACTORS.map((a) => a.id);
		expect(ids).toEqual(['clifford', 'de-jong', 'lorenz', 'thomas']);
		expect(new Set(ids).size).toBe(ids.length);
		for (const a of ATTRACTORS) {
			expect(a.label.length).toBeGreaterThan(0);
			expect(a.dims === 2 || a.dims === 3).toBe(true);
			expect(finite(a.seed)).toBe(true);
		}
	});
});

describe('getAttractor', () => {
	it('returns the requested family', () => {
		expect(getAttractor('lorenz').id).toBe('lorenz');
		expect(getAttractor('de-jong').id).toBe('de-jong');
	});
	it('falls back to the first family for unknown ids', () => {
		expect(getAttractor('nope').id).toBe('clifford');
	});
});

describe('attractor step (CPU reference, matched by the WGSL integrator)', () => {
	it('Clifford maps the origin by its closed form', () => {
		// a=-1.4 b=1.6 c=1.0 d=0.7: x'=sin(a·0)+c·cos(a·0)=1, y'=sin(b·0)+d·cos(b·0)=0.7
		const p = getAttractor('clifford').step({ x: 0, y: 0, z: 0 });
		expect(p.x).toBeCloseTo(1, 10);
		expect(p.y).toBeCloseTo(0.7, 10);
		expect(p.z).toBe(0);
	});

	it('de Jong maps the origin by its closed form', () => {
		// x'=sin(a·0)-cos(b·0)=-1, y'=sin(c·0)-cos(d·0)=-1
		const p = getAttractor('de-jong').step({ x: 0, y: 0, z: 0 });
		expect(p.x).toBeCloseTo(-1, 10);
		expect(p.y).toBeCloseTo(-1, 10);
		expect(p.z).toBe(0);
	});

	it('Lorenz steps in the direction of its vector field', () => {
		// deriv at (1,1,1): (σ(y−x), x(ρ−z)−y, xy−βz) = (0, +26, 1−8/3 < 0)
		const p = getAttractor('lorenz').step({ x: 1, y: 1, z: 1 });
		expect(p.y).toBeGreaterThan(1); // strong +y motion (deriv.y = 26)
		expect(p.z).toBeLessThan(1); // −z motion
		expect(Math.abs(p.x - 1)).toBeLessThan(0.1); // x barely moves (deriv.x = 0)
	});

	it('Thomas preserves its symmetry along the diagonal', () => {
		// At (1,1,1) the symmetric vector field keeps x=y=z under RK4.
		const p = getAttractor('thomas').step({ x: 1, y: 1, z: 1 });
		expect(p.x).toBeCloseTo(p.y, 12);
		expect(p.y).toBeCloseTo(p.z, 12);
		expect(p.x).toBeGreaterThan(1); // sin(1) − b·1 > 0
	});
});

describe('orbit', () => {
	it('produces the requested number of finite, deterministic points', () => {
		for (const a of ATTRACTORS) {
			const pts = orbit(a, 2000);
			expect(pts).toHaveLength(2000);
			expect(pts.every(finite)).toBe(true);
			// Strange attractors stay bounded; no run-away to infinity.
			expect(pts.every((p) => Math.abs(p.x) < 1e4 && Math.abs(p.y) < 1e4)).toBe(true);
			expect(orbit(a, 16)).toEqual(orbit(a, 16));
		}
	});
});

describe('boundsOf', () => {
	it('returns the component-wise min/max of a point cloud', () => {
		const b = boundsOf([
			{ x: -1, y: 2, z: 0 },
			{ x: 3, y: -4, z: 5 }
		]);
		expect(b.min).toEqual({ x: -1, y: -4, z: 0 });
		expect(b.max).toEqual({ x: 3, y: 2, z: 5 });
	});
});
