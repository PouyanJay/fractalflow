import { describe, it, expect } from 'vitest';
import { ifsRenderer, IFS_ID } from './renderer';
import { IFS_SYSTEMS } from './ifs';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { RenderInput } from '$lib/engine/types';

const input = (ifs: string): RenderInput => ({
	width: 100,
	height: 80,
	timeMs: 0,
	scene: { ...createDefaultScene(), ifs }
});

const pack = (ifs: string) => {
	const view = new DataView(new ArrayBuffer(ifsRenderer.uniformSize));
	ifsRenderer.packUniforms(view, input(ifs));
	return view;
};

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
	});
});
