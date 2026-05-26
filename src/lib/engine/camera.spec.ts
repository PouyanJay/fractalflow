import { describe, it, expect } from 'vitest';
import { panCamera, zoomCameraAt, orbitCamera, dollyCamera, formatZoom } from './camera';
import type { Camera2D } from './types';

const base: Camera2D = { centerX: -0.5, centerY: 0, scale: 3 };

describe('formatZoom', () => {
	it('shows one decimal near the home view', () => {
		expect(formatZoom(3)).toBe('1.0×'); // baseScale/scale = 1
		expect(formatZoom(6)).toBe('0.5×');
	});

	it('rounds to a whole number in the mid range', () => {
		expect(formatZoom(0.06)).toBe('50×'); // 3 / 0.06 = 50
	});

	it('switches to exponential for very deep zoom', () => {
		expect(formatZoom(3e-6)).toBe('1.0e+6×');
	});
});

describe('panCamera', () => {
	it('moves the center opposite to a horizontal drag', () => {
		const c = panCamera(base, 100, 0, 600); // perPixel = 3/600 = 0.005
		expect(c.centerX).toBeCloseTo(-0.5 - 100 * 0.005);
		expect(c.centerY).toBeCloseTo(0);
		expect(c.scale).toBe(3);
	});

	it('moves the center with a vertical drag', () => {
		const c = panCamera(base, 0, 60, 600);
		expect(c.centerY).toBeCloseTo(60 * 0.005);
	});
});

describe('zoomCameraAt', () => {
	it('scales by the factor and keeps the center fixed when zooming at the center', () => {
		const c = zoomCameraAt(base, 400, 300, 800, 600, 0.5);
		expect(c.scale).toBeCloseTo(1.5);
		expect(c.centerX).toBeCloseTo(-0.5);
		expect(c.centerY).toBeCloseTo(0);
	});

	it('keeps the point under the cursor fixed when zooming off-center', () => {
		const cursorX = 600;
		const cursorY = 200;
		const w = 800;
		const h = 600;
		const ppBefore = base.scale / h;
		const before = {
			x: base.centerX + (cursorX - w / 2) * ppBefore,
			y: base.centerY - (cursorY - h / 2) * ppBefore
		};
		const c = zoomCameraAt(base, cursorX, cursorY, w, h, 0.4);
		const ppAfter = c.scale / h;
		const after = {
			x: c.centerX + (cursorX - w / 2) * ppAfter,
			y: c.centerY - (cursorY - h / 2) * ppAfter
		};
		expect(after.x).toBeCloseTo(before.x);
		expect(after.y).toBeCloseTo(before.y);
	});
});

describe('orbitCamera (3D: centerX=yaw, centerY=pitch, scale=distance)', () => {
	const base: Camera2D = { centerX: 0.5, centerY: 0.2, scale: 3 };

	it('rotates yaw and pitch by the drag and keeps the distance', () => {
		const c = orbitCamera(base, 10, 5);
		expect(c.centerX).not.toBe(base.centerX);
		expect(c.centerY).not.toBe(base.centerY);
		expect(c.scale).toBe(3);
	});

	it('clamps pitch to avoid the poles', () => {
		expect(orbitCamera(base, 0, 100000).centerY).toBeLessThanOrEqual(1.5);
		expect(orbitCamera(base, 0, -100000).centerY).toBeGreaterThanOrEqual(-1.5);
	});
});

describe('dollyCamera', () => {
	const base: Camera2D = { centerX: 0, centerY: 0, scale: 1 };

	it('scales the zoom by the factor', () => {
		expect(dollyCamera(base, 0.5).scale).toBeCloseTo(0.5);
	});

	it('clamps the zoom to a sane range', () => {
		expect(dollyCamera(base, 100).scale).toBeLessThanOrEqual(2);
		expect(dollyCamera(base, 0.0000001).scale).toBeGreaterThanOrEqual(0.0005);
	});
});
