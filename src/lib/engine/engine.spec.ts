import { describe, it, expect } from 'vitest';
import { computeDrawingBufferSize } from './engine';

describe('computeDrawingBufferSize', () => {
	it('scales CSS pixels by device pixel ratio', () => {
		expect(computeDrawingBufferSize(800, 600, 2, 4096)).toEqual({ width: 1600, height: 1200 });
	});

	it('leaves size unchanged at dpr 1', () => {
		expect(computeDrawingBufferSize(640, 480, 1, 4096)).toEqual({ width: 640, height: 480 });
	});

	it('clamps the longest side to maxDimension, preserving aspect', () => {
		const { width, height } = computeDrawingBufferSize(4000, 3000, 2, 4096);
		expect(Math.max(width, height)).toBeLessThanOrEqual(4096);
		expect(width).toBe(4096);
		expect(height).toBe(3072);
	});

	it('never returns a dimension below 1', () => {
		expect(computeDrawingBufferSize(0, 0, 1, 4096)).toEqual({ width: 1, height: 1 });
	});

	it('floors fractional results', () => {
		expect(computeDrawingBufferSize(100.7, 100.7, 1.5, 4096)).toEqual({ width: 151, height: 151 });
	});
});
