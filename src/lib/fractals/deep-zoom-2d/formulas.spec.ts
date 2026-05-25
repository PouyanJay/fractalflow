import { describe, it, expect } from 'vitest';
import {
	juliaEscape,
	burningShipEscape,
	tricornEscape,
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

describe('formula metadata', () => {
	it('lists the supported formulas in order with stable shader codes', () => {
		expect(FORMULAS.map((f) => f.id)).toEqual(['mandelbrot', 'julia', 'burning-ship', 'tricorn']);
		expect(FORMULA_CODES.mandelbrot).toBe(0);
		expect(FORMULA_CODES.julia).toBe(1);
		expect(FORMULA_CODES['burning-ship']).toBe(2);
		expect(FORMULA_CODES.tricorn).toBe(3);
	});
});
