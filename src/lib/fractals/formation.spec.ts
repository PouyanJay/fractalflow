import { describe, it, expect } from 'vitest';
import { revealedSteps } from './formation';

describe('revealedSteps (Formation orbit trace)', () => {
	it('plots the full orbit when fully formed (absent or ≥1)', () => {
		expect(revealedSteps(undefined, 256)).toBe(256);
		expect(revealedSteps(1, 256)).toBe(256);
		expect(revealedSteps(1.4, 256)).toBe(256);
	});

	it('reveals a growing prefix as formation climbs, never below 1', () => {
		expect(revealedSteps(0, 256)).toBe(1); // the leading point — never a blank frame
		expect(revealedSteps(0.0001, 256)).toBe(1);
		expect(revealedSteps(0.25, 256)).toBe(64);
		expect(revealedSteps(0.5, 256)).toBe(128);
		expect(revealedSteps(0.99, 256)).toBe(253);
	});
});
