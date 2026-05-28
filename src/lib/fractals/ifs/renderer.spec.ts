import { describe, it, expect } from 'vitest';
import { ifsRenderer, IFS_ID } from './renderer';
import { IFS_SYSTEMS, formationMaxDepth, getIFS } from './ifs';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { RenderInput, SceneState } from '$lib/engine/types';

const input = (ifs: string, over: Partial<SceneState> = {}): RenderInput => ({
	width: 100,
	height: 80,
	timeMs: 0,
	scene: { ...createDefaultScene(), ifs, ...over }
});

const pack = (ifs: string, over: Partial<SceneState> = {}) => {
	const view = new DataView(new ArrayBuffer(ifsRenderer.uniformSize));
	ifsRenderer.packUniforms(view, input(ifs, over));
	return view;
};

const DEPTH_OFFSET = 44;

describe('ifsRenderer', () => {
	it('is the WebGPU compute renderer for the IFS art style', () => {
		expect(ifsRenderer.id).toBe(IFS_ID);
		expect(ifsRenderer.pipeline).toBe('compute');
		expect(ifsRenderer.kind).toBe('2d'); // planar pan/zoom, not orbit
		expect(ifsRenderer.accumulationChannels).toBe(2); // density + colour
		expect(ifsRenderer.particleCount).toBeGreaterThan(0);
		expect(ifsRenderer.stepsPerParticle).toBeGreaterThan(0);
		expect(ifsRenderer.uniformSize % 16).toBe(0);
	});

	it('packs resolution, the selected system index and a positive framing radius', () => {
		const view = pack('dragon-curve');
		expect(view.getFloat32(0, true)).toBe(100);
		expect(view.getFloat32(4, true)).toBe(80);
		expect(view.getUint32(8, true)).toBe(IFS_SYSTEMS.findIndex((s) => s.id === 'dragon-curve'));
		expect(view.getUint32(12, true)).toBe(ifsRenderer.stepsPerParticle);
		expect(view.getFloat32(40, true)).toBeGreaterThan(0); // radius
	});

	it('falls back to system index 0 for an unknown system', () => {
		expect(pack('bogus').getUint32(8, true)).toBe(0);
	});

	it('code-generates a chaos game with weighted selection and the entry points', () => {
		const w = ifsRenderer.wgsl;
		expect(w).toContain('@workgroup_size(64)');
		expect(w).toContain('fn integrate');
		expect(w).toContain('fn vs');
		expect(w).toContain('fn fs');
		// Step, colour and the weighted picker are code-generated from IFS_SYSTEMS.
		expect(w).toContain('fn ifsStep');
		expect(w).toContain('fn ifsColor');
		expect(w).toContain('fn ifsPick');
		// The fern's first cumulative weight threshold (0.01) appears in the picker.
		expect(w).toContain('r < 0.01');
		// Both Formation paths exist: a depth branch and the shared plotter.
		expect(w).toContain('fn plot');
		expect(w).toContain('u.depth');
	});

	describe('Formation depth', () => {
		it('packs a negative depth (fully formed) when formation is absent or ≥1', () => {
			expect(pack('sierpinski-triangle').getFloat32(DEPTH_OFFSET, true)).toBeLessThan(0);
			expect(
				pack('sierpinski-triangle', { formation: 1 }).getFloat32(DEPTH_OFFSET, true)
			).toBeLessThan(0);
			expect(
				pack('sierpinski-triangle', { formation: 1.5 }).getFloat32(DEPTH_OFFSET, true)
			).toBeLessThan(0);
		});

		it('ramps depth from 0 toward the system max as formation grows', () => {
			const maxD = formationMaxDepth(getIFS('sierpinski-triangle'));
			expect(pack('sierpinski-triangle', { formation: 0 }).getFloat32(DEPTH_OFFSET, true)).toBe(0);
			expect(
				pack('sierpinski-triangle', { formation: 0.5 }).getFloat32(DEPTH_OFFSET, true)
			).toBeCloseTo(0.5 * maxD, 4);
			expect(
				pack('sierpinski-triangle', { formation: 0.999 }).getFloat32(DEPTH_OFFSET, true)
			).toBeCloseTo(0.999 * maxD, 3);
		});

		it('uses each system’s own max depth (the fern needs more than Sierpiński)', () => {
			const fernD = pack('barnsley-fern', { formation: 1 - 1e-6 }).getFloat32(DEPTH_OFFSET, true);
			const sierD = pack('sierpinski-triangle', { formation: 1 - 1e-6 }).getFloat32(
				DEPTH_OFFSET,
				true
			);
			expect(fernD).toBeGreaterThan(sierD);
		});

		it('packs a seed-hull (meta vertex count ≥ 3) for silhouette seeding', () => {
			// meta vec4f sits right after the HULL_MAX (=16) packed vec4f points.
			const metaBase = 112 + (16 / 2) * 16;
			const view = pack('sierpinski-triangle', { formation: 0.3 });
			const count = view.getFloat32(metaBase + 8, true);
			expect(count).toBeGreaterThanOrEqual(3);
			expect(Number.isFinite(view.getFloat32(metaBase, true))).toBe(true); // centroid x
			// The shader's seed/inside-hull helpers exist.
			expect(ifsRenderer.wgsl).toContain('fn seedInHull');
			expect(ifsRenderer.wgsl).toContain('fn insideHull');
		});
	});
});
