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
			'celtic-mandelbar'
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
	});
});
