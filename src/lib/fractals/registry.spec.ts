import { describe, it, expect } from 'vitest';
import { getRenderer } from './registry';

describe('getRenderer', () => {
	it('returns the Deep-Zoom 2D renderer for that style', () => {
		const r = getRenderer('deep-zoom-2d');
		expect(r?.id).toBe('deep-zoom-2d');
		expect(r?.kind).toBe('2d');
	});

	it('returns null for art styles that are not implemented yet', () => {
		expect(getRenderer('flames')).toBeNull();
		expect(getRenderer('attractors')).toBeNull();
	});
});
