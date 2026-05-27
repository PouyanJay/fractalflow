import { describe, it, expect } from 'vitest';
import { randomizeScene, mutateScene } from './randomize';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import { COLORINGS } from '$lib/fractals/deep-zoom-2d/coloring';
import { ATTRACTORS } from '$lib/fractals/glowing-attractors/attractors';
import { IFS_SYSTEMS } from '$lib/fractals/ifs/ifs';

const COLOR_IDS = COLORINGS.map((c) => c.id);

describe('randomizeScene', () => {
	it('is deterministic for a given seed', () => {
		const s = createDefaultScene();
		expect(randomizeScene(s, 'deep-zoom-2d', 42)).toEqual(randomizeScene(s, 'deep-zoom-2d', 42));
		expect(randomizeScene(s, 'deep-zoom-2d', 42)).not.toEqual(
			randomizeScene(s, 'deep-zoom-2d', 43)
		);
	});

	it('keeps the camera and formula but gives a fresh, valid look', () => {
		const s = createDefaultScene();
		const r = randomizeScene(s, 'deep-zoom-2d', 7);
		expect(r.camera).toEqual(s.camera); // stays where you are
		expect(r.formula).toBe(s.formula);
		expect(r.paletteCoeffs).toBeDefined(); // new colours
		expect(COLOR_IDS).toContain(r.coloring);
		expect(r.post.hueShift).toBeGreaterThanOrEqual(-0.5);
		expect(r.post.hueShift).toBeLessThanOrEqual(0.5);
		expect(r.post.saturation).toBeGreaterThan(0);
		expect(Number.isFinite(r.post.warpAmount)).toBe(true);
	});

	it('randomizes the Julia seed for seed-driven formulas', () => {
		const s = { ...createDefaultScene(), formula: 'julia' as const };
		const seeds = [1, 2, 3].map((n) => randomizeScene(s, 'deep-zoom-2d', n).juliaSeed);
		expect(seeds[0]).not.toEqual(seeds[1]);
		for (const seed of seeds) {
			expect(Math.hypot(seed.x, seed.y)).toBeLessThanOrEqual(1.2);
		}
	});

	it('picks a valid family for the compute art styles', () => {
		expect(ATTRACTORS.map((a) => a.id)).toContain(
			randomizeScene(createDefaultScene(), 'attractors', 5).attractor
		);
		expect(IFS_SYSTEMS.map((i) => i.id)).toContain(
			randomizeScene(createDefaultScene(), 'ifs', 5).ifs
		);
	});

	it('keeps the Multibrot power in range', () => {
		const s = { ...createDefaultScene(), formula: 'multibrot' as const };
		for (const n of [1, 9, 17]) {
			const p = randomizeScene(s, 'deep-zoom-2d', n).power!;
			expect(p).toBeGreaterThanOrEqual(2);
			expect(p).toBeLessThanOrEqual(8);
		}
	});
});

describe('mutateScene', () => {
	it('is deterministic and keeps structural choices (camera, formula, warp mode)', () => {
		const s = { ...createDefaultScene(), post: { ...createDefaultScene().post, warp: 'kaleido' } };
		const m = mutateScene(s, 'deep-zoom-2d', 9);
		expect(mutateScene(s, 'deep-zoom-2d', 9)).toEqual(m);
		expect(m.camera).toEqual(s.camera);
		expect(m.formula).toBe(s.formula);
		expect(m.post.warp).toBe('kaleido'); // discrete choice preserved
	});

	it('nudges the palette and grade within valid ranges', () => {
		const s = createDefaultScene();
		const m = mutateScene(s, 'deep-zoom-2d', 11);
		expect(m.paletteCoeffs).toBeDefined();
		expect(m.post.hueShift).toBeGreaterThanOrEqual(-0.5);
		expect(m.post.hueShift).toBeLessThanOrEqual(0.5);
		expect(m.post.saturation).toBeGreaterThanOrEqual(0);
		// palette coeff channels stay in their conventional bands
		for (const ch of m.paletteCoeffs!.a) {
			expect(ch).toBeGreaterThanOrEqual(0);
			expect(ch).toBeLessThanOrEqual(1);
		}
	});

	it('keeps the Multibrot power in range when mutating', () => {
		const s = { ...createDefaultScene(), formula: 'multibrot' as const, power: 7.5 };
		for (const n of [1, 4, 8]) {
			const p = mutateScene(s, 'deep-zoom-2d', n).power!;
			expect(p).toBeGreaterThanOrEqual(2);
			expect(p).toBeLessThanOrEqual(8);
		}
	});
});
