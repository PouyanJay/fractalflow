import { describe, it, expect } from 'vitest';
import { computeDrawingBufferSize, decideFrame, type RefineState } from './engine';

const OPTS = { refineOnIdle: true, idleMs: 150, idleSamples: 3 };
const FRESH: RefineState = { sig: '', changedAt: 0, refined: false };

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

describe('decideFrame (refine-on-idle policy)', () => {
	it('renders every frame at 1 sample when the renderer does not refine', () => {
		const d = decideFrame(FRESH, 'a', 1000, { ...OPTS, refineOnIdle: false });
		expect(d).toMatchObject({ render: true, aaSamples: 1 });
		// A second identical frame still renders (no idle skipping for these renderers).
		const d2 = decideFrame(d.state, 'a', 2000, { ...OPTS, refineOnIdle: false });
		expect(d2.render).toBe(true);
		expect(d2.aaSamples).toBe(1);
	});

	it('renders 1 sample on the frame the signature changes', () => {
		const d = decideFrame({ sig: 'a', changedAt: 0, refined: true }, 'b', 500, OPTS);
		expect(d).toMatchObject({ render: true, aaSamples: 1 });
		expect(d.state).toEqual({ sig: 'b', changedAt: 500, refined: false });
	});

	it('does not refine while still inside the idle window', () => {
		const moved = decideFrame(FRESH, 'a', 1000, OPTS).state;
		const d = decideFrame(moved, 'a', 1000 + 149, OPTS);
		expect(d.render).toBe(false);
	});

	it('fires one high-quality pass once the view holds still past the idle window', () => {
		const moved = decideFrame(FRESH, 'a', 1000, OPTS).state;
		const refined = decideFrame(moved, 'a', 1000 + 150, OPTS);
		expect(refined).toMatchObject({ render: true, aaSamples: 3 });
		expect(refined.state.refined).toBe(true);
		// Subsequent idle frames skip — the refine pass is not repeated.
		const after = decideFrame(refined.state, 'a', 1000 + 400, OPTS);
		expect(after.render).toBe(false);
	});

	it('re-arms after a new change so the next still view refines again', () => {
		const refined = decideFrame({ sig: 'a', changedAt: 0, refined: true }, 'b', 100, OPTS).state;
		expect(refined.refined).toBe(false);
		const again = decideFrame(refined, 'b', 100 + 150, OPTS);
		expect(again).toMatchObject({ render: true, aaSamples: 3 });
	});
});
