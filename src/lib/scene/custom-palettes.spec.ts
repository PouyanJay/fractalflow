import { describe, it, expect } from 'vitest';
import {
	addCustomPalette,
	removeCustomPalette,
	serializeCustomPalettes,
	parseCustomPalettes,
	type CustomPalette
} from './custom-palettes';
import type { PaletteCoeffs } from '$lib/fractals/palette';

const coeffs: PaletteCoeffs = {
	a: [0.5, 0.5, 0.5],
	b: [0.5, 0.5, 0.5],
	c: [1, 1, 1],
	d: [0, 0.3, 0.6]
};

describe('custom palette list ops', () => {
	it('adds newest-first and removes by id without mutating the input', () => {
		const a = addCustomPalette([], 'One', coeffs);
		const b = addCustomPalette(a, 'Two', coeffs);
		expect(b.map((p) => p.label)).toEqual(['Two', 'One']);
		expect(a).toHaveLength(1); // original untouched
		const removed = removeCustomPalette(b, b[0].id);
		expect(removed.map((p) => p.label)).toEqual(['One']);
	});

	it('round-trips through serialize/parse', () => {
		const list = addCustomPalette([], 'Mine', coeffs);
		const back = parseCustomPalettes(serializeCustomPalettes(list));
		expect(back).toEqual(list);
	});

	it('drops malformed entries and survives garbage input', () => {
		expect(parseCustomPalettes('not json')).toEqual([]);
		expect(parseCustomPalettes('{}')).toEqual([]);
		const mixed = JSON.stringify([
			{ id: 'x', label: 'ok', coeffs },
			{ id: 'y', label: 'bad', coeffs: { a: [0, 0], b: 1 } }, // invalid coeffs
			{ label: 'no id', coeffs }
		]);
		const parsed = parseCustomPalettes(mixed);
		expect(parsed).toHaveLength(1);
		expect(parsed[0].label).toBe('ok');
	});
});

describe('CustomPalette typing', () => {
	it('keeps the coeffs intact', () => {
		const list: CustomPalette[] = addCustomPalette([], 'T', coeffs);
		expect(list[0].coeffs.d).toEqual([0, 0.3, 0.6]);
	});
});
