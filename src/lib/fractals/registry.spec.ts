import { describe, it, expect } from 'vitest';
import { getRenderer } from './registry';

describe('getRenderer', () => {
	it('returns the Deep-Zoom 2D renderer for that style', () => {
		const r = getRenderer('deep-zoom-2d');
		expect(r?.id).toBe('deep-zoom-2d');
		expect(r?.kind).toBe('2d');
	});

	it('returns the Geometric 3D renderer for that style', () => {
		const r = getRenderer('geometric-3d');
		expect(r?.id).toBe('geometric-3d');
		expect(r?.kind).toBe('3d');
	});

	it('returns the Glowing Attractors compute renderer for that style', () => {
		const r = getRenderer('attractors');
		expect(r?.id).toBe('attractors');
		expect(r?.kind).toBe('3d');
		expect(r?.pipeline).toBe('compute');
	});

	it('returns the Painterly Flames compute renderer for that style', () => {
		const r = getRenderer('flames');
		expect(r?.id).toBe('flames');
		expect(r?.kind).toBe('2d');
		expect(r?.pipeline).toBe('compute');
	});

	it('returns null for an unknown art style', () => {
		expect(getRenderer('nonexistent' as Parameters<typeof getRenderer>[0])).toBeNull();
	});
});
