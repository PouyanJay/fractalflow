import { describe, it, expect } from 'vitest';
import { mandelbrotEscape, pixelToComplex } from './reference';

describe('mandelbrotEscape', () => {
	it('keeps the origin inside the set', () => {
		const r = mandelbrotEscape(0, 0, 200);
		expect(r.escaped).toBe(false);
		expect(r.smooth).toBe(200);
	});

	it('keeps the period-2 bulb point (-1, 0) inside', () => {
		expect(mandelbrotEscape(-1, 0, 500).escaped).toBe(false);
	});

	it('escapes a far point quickly', () => {
		const r = mandelbrotEscape(2, 2, 200);
		expect(r.escaped).toBe(true);
		expect(r.iter).toBeLessThan(5);
	});

	it('gives escaped points a finite smooth value near the integer iteration', () => {
		const r = mandelbrotEscape(0.5, 0.5, 200);
		expect(r.escaped).toBe(true);
		expect(Number.isFinite(r.smooth)).toBe(true);
		// Smooth coloring is a small fractional adjustment around the escape iteration.
		expect(Math.abs(r.smooth - r.iter)).toBeLessThan(5);
	});
});

describe('pixelToComplex', () => {
	it('maps the center pixel to the camera center', () => {
		const c = pixelToComplex(400, 300, 800, 600, -0.5, 0, 3);
		expect(c.x).toBeCloseTo(-0.5);
		expect(c.y).toBeCloseTo(0);
	});

	it('treats up as the positive imaginary direction', () => {
		const above = pixelToComplex(400, 200, 800, 600, 0, 0, 3);
		expect(above.y).toBeGreaterThan(0);
	});

	it('scales horizontal distance by the per-pixel size', () => {
		const c = pixelToComplex(400 + 100, 300, 800, 600, 0, 0, 600); // perPixel = 600/600 = 1
		expect(c.x).toBeCloseTo(100);
	});
});
