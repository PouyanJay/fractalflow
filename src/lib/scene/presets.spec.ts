import { describe, it, expect } from 'vitest';
import { PRESETS } from './presets';
import { encodeScene, decodeScene } from './codec';

describe('PRESETS', () => {
	it('provides several curated presets with unique ids and labels', () => {
		expect(PRESETS.length).toBeGreaterThanOrEqual(4);
		const ids = PRESETS.map((p) => p.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const p of PRESETS) {
			expect(p.id.length).toBeGreaterThan(0);
			expect(p.label.length).toBeGreaterThan(0);
			expect(p.styleId.length).toBeGreaterThan(0);
		}
	});

	it('every preset scene is well-formed (survives codec round-trip)', () => {
		for (const p of PRESETS) {
			expect(decodeScene(encodeScene(p.scene))).toEqual(p.scene);
		}
	});
});
