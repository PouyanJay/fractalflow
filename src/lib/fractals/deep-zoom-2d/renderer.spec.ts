import { describe, it, expect } from 'vitest';
import { autoMaxIter, effectiveMaxIter, createDefaultScene } from './renderer';

describe('autoMaxIter (zoom-derived iteration floor)', () => {
	it('is 0 at and around the home view, so the manual slider rules when shallow', () => {
		expect(autoMaxIter(3)).toBe(0); // 1× zoom
		expect(autoMaxIter(0.03)).toBe(0); // 100× — still shallow
	});

	it('climbs with zoom depth', () => {
		const z1e6 = autoMaxIter(3e-6);
		const z1e9 = autoMaxIter(3e-9);
		const z1e12 = autoMaxIter(3e-12);
		expect(z1e6).toBeGreaterThan(800);
		expect(z1e9).toBeGreaterThan(z1e6);
		expect(z1e12).toBeGreaterThan(z1e9);
	});

	it('never exceeds the iteration cap, even at absurd depth', () => {
		expect(autoMaxIter(3e-40)).toBeLessThanOrEqual(8000);
		expect(autoMaxIter(3e-40)).toBe(8000);
	});
});

describe('effectiveMaxIter (manual setting floored by the zoom curve)', () => {
	it('equals the manual value when shallow', () => {
		const s = createDefaultScene(); // scale 3, maxIter 300
		expect(effectiveMaxIter(s)).toBe(300);
	});

	it('lifts a low manual value at deep zoom so the view still resolves', () => {
		const s = { ...createDefaultScene(), maxIter: 300, camera: { centerX: -0.5, centerY: 0, scale: 3e-9 } };
		expect(effectiveMaxIter(s)).toBe(autoMaxIter(3e-9));
		expect(effectiveMaxIter(s)).toBeGreaterThan(300);
	});

	it('keeps a high manual value above the floor', () => {
		const s = { ...createDefaultScene(), maxIter: 8000, camera: { centerX: -0.5, centerY: 0, scale: 3e-6 } };
		expect(effectiveMaxIter(s)).toBe(8000);
	});
});
