import { describe, it, expect } from 'vitest';
import { frameCountFor, sequenceScenes, frameFilename } from './sequence';
import type { Keyframe } from '$lib/animate/timeline';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';

const kf = (id: string, t: number, scale: number): Keyframe => ({
	id,
	t,
	scene: { ...createDefaultScene(), camera: { centerX: 0, centerY: 0, scale } }
});

describe('frameCountFor', () => {
	it('multiplies duration (seconds) by fps, at least one frame', () => {
		expect(frameCountFor(8000, 30)).toBe(240);
		expect(frameCountFor(2000, 24)).toBe(48);
		expect(frameCountFor(0, 30)).toBe(1);
	});
});

describe('sequenceScenes', () => {
	const keys = [kf('a', 0, 4), kf('b', 1, 0.04)];

	it('produces the requested number of frames spanning the timeline', () => {
		const frames = sequenceScenes(keys, 5);
		expect(frames).toHaveLength(5);
		expect(frames[0].camera.scale).toBeCloseTo(4, 10); // first keyframe
		expect(frames[4].camera.scale).toBeCloseTo(0.04, 10); // last keyframe
		// geometric midpoint
		expect(frames[2].camera.scale).toBeCloseTo(0.4, 6);
	});

	it('returns a single frame for a one-frame request', () => {
		expect(sequenceScenes(keys, 1)).toHaveLength(1);
		expect(sequenceScenes(keys, 1)[0].camera.scale).toBeCloseTo(4, 10);
	});
});

describe('frameFilename', () => {
	it('zero-pads the index for lexical ordering', () => {
		expect(frameFilename(0, 240)).toBe('frame-0000.png');
		expect(frameFilename(42, 240)).toBe('frame-0042.png');
		expect(frameFilename(7, 10)).toBe('frame-0007.png');
	});
});
