import { describe, it, expect } from 'vitest';
import {
	BLEND_MODES,
	isBlendMode,
	singleStack,
	makeLayer,
	addLayer,
	removeLayer,
	moveLayer,
	updateLayer,
	setActive,
	activeLayer,
	MAX_LAYERS
} from './layers';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';

const scene = createDefaultScene();
const base = () => singleStack('deep-zoom-2d', scene);

describe('blend modes', () => {
	it('exposes CSS mix-blend-mode names and validates them', () => {
		expect(BLEND_MODES.map((b) => b.id)).toContain('screen');
		expect(isBlendMode('multiply')).toBe(true);
		expect(isBlendMode('not-a-blend')).toBe(false);
	});
});

describe('singleStack', () => {
	it('wraps one scene as the active bottom layer', () => {
		const s = base();
		expect(s.layers).toHaveLength(1);
		expect(activeLayer(s).scene).toBe(scene);
		expect(activeLayer(s).blend).toBe('normal');
		expect(activeLayer(s).opacity).toBe(1);
		expect(s.activeId).toBe(s.layers[0].id);
	});
});

describe('addLayer', () => {
	it('stacks a new layer on top and makes it active', () => {
		const layer = makeLayer('flames', scene);
		const s = addLayer(base(), layer);
		expect(s.layers).toHaveLength(2);
		expect(s.layers[1]).toBe(layer); // on top
		expect(s.activeId).toBe(layer.id);
	});

	it('refuses to exceed MAX_LAYERS', () => {
		let s = base();
		for (let i = 0; i < MAX_LAYERS + 3; i++) s = addLayer(s, makeLayer('flames', scene));
		expect(s.layers.length).toBe(MAX_LAYERS);
	});
});

describe('removeLayer', () => {
	it('never removes the last layer', () => {
		const s = removeLayer(base(), base().layers[0].id);
		expect(s.layers).toHaveLength(1);
	});

	it('removes a layer and reassigns active when the active one goes', () => {
		const l2 = makeLayer('flames', scene);
		const s = addLayer(base(), l2); // active = l2 (top)
		const after = removeLayer(s, l2.id);
		expect(after.layers).toHaveLength(1);
		expect(after.activeId).toBe(after.layers[0].id); // fell back to the survivor
	});
});

describe('moveLayer', () => {
	it('reorders within bounds and is a no-op at the ends', () => {
		const l2 = makeLayer('flames', scene);
		const s = addLayer(base(), l2); // [base, l2]
		const down = moveLayer(s, l2.id, -1); // l2 to bottom
		expect(down.layers[0].id).toBe(l2.id);
		expect(moveLayer(s, l2.id, 1)).toBe(s); // already top → unchanged
		expect(moveLayer(s, s.layers[0].id, -1)).toBe(s); // already bottom → unchanged
	});
});

describe('updateLayer', () => {
	it('patches fields and clamps opacity', () => {
		const s = base();
		const id = s.layers[0].id;
		expect(updateLayer(s, id, { blend: 'screen' }).layers[0].blend).toBe('screen');
		expect(updateLayer(s, id, { opacity: 1.7 }).layers[0].opacity).toBe(1);
		expect(updateLayer(s, id, { opacity: -0.3 }).layers[0].opacity).toBe(0);
		expect(updateLayer(s, id, { visible: false }).layers[0].visible).toBe(false);
	});
});

describe('setActive', () => {
	it('selects an existing layer and ignores unknown ids', () => {
		const l2 = makeLayer('flames', scene);
		const s = addLayer(base(), l2);
		expect(setActive(s, s.layers[0].id).activeId).toBe(s.layers[0].id);
		expect(setActive(s, 'bogus')).toBe(s);
	});
});
