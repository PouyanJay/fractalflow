import { describe, it, expect } from 'vitest';
import { composeNodes, composeEdges, sourceLabel } from './graph';

describe('compose graph', () => {
	it('defines the source → warp → coloring → post → output node chain', () => {
		const ids = composeNodes().map((n) => n.id);
		expect(ids).toEqual(['source', 'warp', 'coloring', 'post', 'output']);
		expect(new Set(ids).size).toBe(ids.length);
		for (const n of composeNodes()) {
			expect(typeof n.position.x).toBe('number');
			expect(typeof n.position.y).toBe('number');
		}
	});

	it('wires edges between existing nodes forming a pipeline', () => {
		const ids = new Set(composeNodes().map((n) => n.id));
		const edges = composeEdges();
		for (const e of edges) {
			expect(ids.has(e.source)).toBe(true);
			expect(ids.has(e.target)).toBe(true);
		}
		expect(edges.map((e) => [e.source, e.target])).toEqual([
			['source', 'warp'],
			['warp', 'coloring'],
			['coloring', 'post'],
			['post', 'output']
		]);
	});
});

describe('sourceLabel', () => {
	it('names the source node after the active art style', () => {
		expect(sourceLabel('deep-zoom-2d')).toBe('Deep-Zoom 2D');
		expect(sourceLabel('attractors')).toBe('Glowing Attractors');
	});
	it('falls back to a generic label when no style is selected', () => {
		expect(sourceLabel(null)).toBe('Source');
	});
});
