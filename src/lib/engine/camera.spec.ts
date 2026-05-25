import { describe, it, expect } from 'vitest';
import { panCamera, zoomCameraAt } from './camera';
import type { Camera2D } from './types';

const base: Camera2D = { centerX: -0.5, centerY: 0, scale: 3 };

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
