import { describe, it, expect } from 'vitest';
import {
	mandelbrotEscape,
	juliaEscape,
	burningShipEscape,
	tricornEscape,
	celticEscape,
	buffaloEscape,
	perpendicularEscape,
	perpendicularShipEscape,
	celticMandelbarEscape,
	multibrotEscape,
	newtonRoot,
	phoenixEscape,
	NEWTON_ROOTS,
	FORMULAS,
	FORMULA_CODES
} from './reference';

describe('juliaEscape', () => {
	it('stays bounded when z0 and seed are both zero', () => {
		expect(juliaEscape(0, 0, 0, 0, 200).escaped).toBe(false);
	});

	it('escapes a far starting point quickly', () => {
		const r = juliaEscape(2, 2, -0.8, 0.156, 200);
		expect(r.escaped).toBe(true);
		expect(r.iter).toBeLessThan(5);
	});

	it('gives escaped points a finite smooth value near the iteration', () => {
		const r = juliaEscape(1, 1, -0.8, 0.156, 200);
		expect(r.escaped).toBe(true);
		expect(Number.isFinite(r.smooth)).toBe(true);
		expect(Math.abs(r.smooth - r.iter)).toBeLessThan(5);
	});
});

describe('burningShipEscape', () => {
	it('keeps c = 0 inside the set', () => {
		expect(burningShipEscape(0, 0, 200).escaped).toBe(false);
	});

	it('escapes a far point quickly', () => {
		const r = burningShipEscape(3, 3, 200);
		expect(r.escaped).toBe(true);
		expect(r.iter).toBeLessThan(5);
	});
});

describe('tricornEscape', () => {
	it('keeps the origin inside the set', () => {
		expect(tricornEscape(0, 0, 200).escaped).toBe(false);
	});

	it('escapes a far point quickly', () => {
		const r = tricornEscape(3, 3, 200);
		expect(r.escaped).toBe(true);
		expect(r.iter).toBeLessThan(5);
	});
});

describe('abs-variant escapes', () => {
	const variants = [
		celticEscape,
		buffaloEscape,
		perpendicularEscape,
		perpendicularShipEscape,
		celticMandelbarEscape
	];

	it('keeps c = 0 inside every variant (z stays at 0)', () => {
		for (const f of variants) expect(f(0, 0, 200).escaped).toBe(false);
	});

	it('escapes a far point quickly in every variant', () => {
		for (const f of variants) {
			const r = f(3, 3, 200);
			expect(r.escaped).toBe(true);
			expect(r.iter).toBeLessThan(5);
		}
	});

	it('gives escaped points a finite smooth value near the iteration', () => {
		for (const f of variants) {
			const r = f(1.5, 1.5, 200);
			expect(r.escaped).toBe(true);
			expect(Number.isFinite(r.smooth)).toBe(true);
			expect(Math.abs(r.smooth - r.iter)).toBeLessThan(5);
		}
	});

	it('are genuinely distinct maps — the abs fold changes the dynamics', () => {
		// A point chosen so the folds bite: the five variants and the plain
		// Mandelbrot do not all share one escape time here.
		const p: [number, number] = [-0.5, 0.6];
		const iters = [mandelbrotEscape(...p, 400), ...variants.map((f) => f(...p, 400))].map(
			(r) => r.iter
		);
		expect(new Set(iters).size).toBeGreaterThan(1);
	});
});

describe('multibrotEscape', () => {
	it('reduces to the Mandelbrot at power 2 (membership agrees)', () => {
		// The polar form and the algebraic z²+c can differ by ±1 iteration on the
		// knife-edge of the boundary, so compare set membership (well clear of it).
		const inside: Array<[number, number]> = [
			[0, 0],
			[-1, 0],
			[-0.1, 0.1]
		];
		const outside: Array<[number, number]> = [
			[2, 2],
			[1, 1],
			[-1.5, 0.5]
		];
		for (const [x, y] of inside) {
			expect(multibrotEscape(x, y, 2, 400).escaped).toBe(false);
			expect(mandelbrotEscape(x, y, 400).escaped).toBe(false);
		}
		for (const [x, y] of outside) {
			expect(multibrotEscape(x, y, 2, 400).escaped).toBe(true);
			expect(mandelbrotEscape(x, y, 400).escaped).toBe(true);
		}
	});

	it('keeps the origin inside at any power and escapes far points fast', () => {
		for (const power of [2, 3, 5, 8]) {
			expect(multibrotEscape(0, 0, power, 200).escaped).toBe(false);
			expect(multibrotEscape(3, 3, power, 200).iter).toBeLessThan(5);
		}
	});

	it('produces a genuinely different set as the exponent changes', () => {
		// Count interior points on a grid: the degree-2 and degree-6 sets have
		// different silhouettes, so their interior counts must differ.
		const countInside = (power: number) => {
			let inside = 0;
			for (let i = 0; i < 40; i++) {
				for (let j = 0; j < 40; j++) {
					const x = -1.5 + (i / 39) * 2; // [-1.5, 0.5]
					const y = -1 + (j / 39) * 2; // [-1, 1]
					if (!multibrotEscape(x, y, power, 300).escaped) inside++;
				}
			}
			return inside;
		};
		expect(countInside(2)).not.toBe(countInside(6));
	});
});

describe('newtonRoot', () => {
	it('converges each cube root of unity to its own basin, fast', () => {
		NEWTON_ROOTS.forEach(([rx, ry], idx) => {
			// Start a hair off the root so the iteration actually runs a step.
			const r = newtonRoot(rx + 0.02, ry + 0.02, 100);
			expect(r.root).toBe(idx);
			expect(r.iter).toBeLessThan(15);
		});
	});

	it('assigns a real-axis start to the real root (root 0)', () => {
		expect(newtonRoot(0.7, 0, 100).root).toBe(0);
	});

	it('sends conjugate starts to conjugate roots (all three basins reachable)', () => {
		// Clearly inside the upper / lower complex-root basins.
		expect(newtonRoot(-0.5, 1.0, 200).root).toBe(1);
		expect(newtonRoot(-0.5, -1.0, 200).root).toBe(2);
	});
});

describe('phoenixEscape', () => {
	it('reduces to a real-seed Julia when the coupling p is 0', () => {
		for (const [x, y] of [
			[0.3, 0.2],
			[-0.5, 0.4],
			[1, 1]
		] as const) {
			const ph = phoenixEscape(x, y, 0.5, 0, 300);
			const ju = juliaEscape(x, y, 0.5, 0, 300);
			expect(ph.escaped).toBe(ju.escaped);
			expect(ph.iter).toBe(ju.iter);
		}
	});

	it('the coupling term changes the dynamics (p ≠ 0 differs from p = 0)', () => {
		// Count interior points: the memory term reshapes the set.
		const inside = (p: number) => {
			let n = 0;
			for (let i = 0; i < 30; i++)
				for (let j = 0; j < 30; j++) {
					const x = -1.2 + (i / 29) * 2.4;
					const y = -1.2 + (j / 29) * 2.4;
					if (!phoenixEscape(x, y, 0.5667, p, 200).escaped) n++;
				}
			return n;
		};
		expect(inside(-0.5)).not.toBe(inside(0));
	});

	it('keeps far starts escaping quickly', () => {
		expect(phoenixEscape(5, 5, 0.5667, -0.5, 200).iter).toBeLessThan(5);
	});
});

describe('formula metadata', () => {
	it('lists the supported formulas in order with stable shader codes', () => {
		expect(FORMULAS.map((f) => f.id)).toEqual([
			'mandelbrot',
			'julia',
			'burning-ship',
			'tricorn',
			'celtic',
			'buffalo',
			'perpendicular',
			'perpendicular-ship',
			'celtic-mandelbar',
			'multibrot',
			'newton',
			'phoenix',
			'lyapunov',
			'apollonian',
			'nova'
		]);
		expect(FORMULA_CODES.mandelbrot).toBe(0);
		expect(FORMULA_CODES.julia).toBe(1);
		expect(FORMULA_CODES['burning-ship']).toBe(2);
		expect(FORMULA_CODES.tricorn).toBe(3);
		expect(FORMULA_CODES.celtic).toBe(4);
		expect(FORMULA_CODES.buffalo).toBe(5);
		expect(FORMULA_CODES.perpendicular).toBe(6);
		expect(FORMULA_CODES['perpendicular-ship']).toBe(7);
		expect(FORMULA_CODES['celtic-mandelbar']).toBe(8);
		expect(FORMULA_CODES.multibrot).toBe(9);
		expect(FORMULA_CODES.newton).toBe(10);
		expect(FORMULA_CODES.phoenix).toBe(11);
		expect(FORMULA_CODES.lyapunov).toBe(12);
		expect(FORMULA_CODES.apollonian).toBe(13);
		expect(FORMULA_CODES.nova).toBe(14);
	});
});
