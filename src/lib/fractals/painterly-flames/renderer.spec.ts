import { describe, it, expect } from 'vitest';
import { flamesRenderer, PAINTERLY_FLAMES_ID } from './renderer';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';
import type { RenderInput } from '$lib/engine/types';

const input = (flame: string): RenderInput => ({
	width: 100,
	height: 80,
	timeMs: 0,
	scene: { ...createDefaultScene(), flame }
});

const pack = (flame: string, formation?: number) => {
	const view = new DataView(new ArrayBuffer(flamesRenderer.uniformSize));
	const base = input(flame);
	flamesRenderer.packUniforms(view, { ...base, scene: { ...base.scene, formation } });
	return view;
};

describe('flamesRenderer', () => {
	it('is the WebGPU compute renderer for the flames art style', () => {
		expect(flamesRenderer.id).toBe(PAINTERLY_FLAMES_ID);
		expect(flamesRenderer.pipeline).toBe('compute');
		expect(flamesRenderer.kind).toBe('2d'); // pan/zoom, not orbit
		expect(flamesRenderer.accumulationChannels).toBe(2); // density + colour
		expect(flamesRenderer.particleCount).toBeGreaterThan(0);
		expect(flamesRenderer.stepsPerParticle).toBeGreaterThan(0);
		expect(flamesRenderer.uniformSize % 16).toBe(0);
	});

	it('packs resolution, the selected flame index and a positive framing radius', () => {
		const view = pack('swirl');
		expect(view.getFloat32(0, true)).toBe(100);
		expect(view.getFloat32(4, true)).toBe(80);
		expect(view.getUint32(8, true)).toBe(2); // sierpinski,sinusoidal,swirl,horseshoe → 2
		expect(view.getUint32(12, true)).toBe(flamesRenderer.stepsPerParticle);
		expect(view.getFloat32(40, true)).toBeGreaterThan(0); // radius
	});

	it('falls back to flame index 0 for an unknown flame', () => {
		expect(pack('bogus').getUint32(8, true)).toBe(0);
	});

	it('generates a WGSL chaos game mirroring the variations and entry points', () => {
		const w = flamesRenderer.wgsl;
		expect(w).toContain('@workgroup_size(64)');
		expect(w).toContain('fn integrate');
		expect(w).toContain('fn vs');
		expect(w).toContain('fn fs');
		expect(w).toContain('fn variation');
		// The transforms are code-generated from the CPU FLAMES table.
		expect(w).toContain('fn flameStep');
		// Formation: the orbit-trace stagger gate.
		expect(w).toContain('fn birthPhase');
	});

	it('Formation traces the orbit: the step count reveals a growing prefix', () => {
		const full = flamesRenderer.stepsPerParticle;
		expect(pack('swirl').getUint32(12, true)).toBe(full); // absent → fully formed
		expect(pack('swirl', 1).getUint32(12, true)).toBe(full);
		expect(pack('swirl', 0.25).getUint32(12, true)).toBe(Math.round(0.25 * full));
		expect(pack('swirl', 0).getUint32(12, true)).toBe(1); // a leading point, never blank
	});
});
