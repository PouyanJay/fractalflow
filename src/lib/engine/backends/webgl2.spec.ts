import { describe, it, expect } from 'vitest';
import { createWebGL2Backend } from './webgl2';

describe('createWebGL2Backend', () => {
	it('returns null when a webgl2 context cannot be created', () => {
		const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
		expect(createWebGL2Backend(canvas)).toBeNull();
	});
});
