/**
 * Layer-stack model for multi-layer compositing. A document can stack several
 * fractal layers — each its own art style + Scene — and composite them with a
 * per-layer blend mode and opacity (the Apophysis / Ultra Fractal "layers"
 * idea). The blend-mode ids are exactly the CSS `mix-blend-mode` values, so the
 * Explore viewport composites by stacking one canvas per layer; export mirrors
 * it with `globalCompositeOperation`.
 *
 * Pure and framework-free: every operation returns a new stack, so the reactive
 * store and the codec build on tested transforms. `layers[0]` is the bottom.
 */
import type { SceneState } from '$lib/engine/types';
import type { ArtStyleId } from '$lib/stores/ui-logic';

export type BlendMode =
	| 'normal'
	| 'screen'
	| 'multiply'
	| 'overlay'
	| 'lighten'
	| 'darken'
	| 'color-dodge'
	| 'difference';

export const BLEND_MODES: { id: BlendMode; label: string }[] = [
	{ id: 'normal', label: 'Normal' },
	{ id: 'screen', label: 'Screen' },
	{ id: 'multiply', label: 'Multiply' },
	{ id: 'overlay', label: 'Overlay' },
	{ id: 'lighten', label: 'Lighten' },
	{ id: 'darken', label: 'Darken' },
	{ id: 'color-dodge', label: 'Color Dodge' },
	{ id: 'difference', label: 'Difference' }
];

const BLEND_IDS = new Set<string>(BLEND_MODES.map((b) => b.id));
export function isBlendMode(v: string): v is BlendMode {
	return BLEND_IDS.has(v);
}

export interface Layer {
	id: string;
	/** For the active layer this `style`/`scene` pair is a snapshot — the live
	 * value lives in the ui/scene stores until the next sync (see layers store). */
	style: ArtStyleId;
	scene: SceneState;
	blend: BlendMode;
	opacity: number;
	visible: boolean;
}

/** An ordered stack (bottom → top) and which layer is being edited. */
export interface LayerStack {
	layers: Layer[];
	activeId: string;
}

export const MAX_LAYERS = 6;

let counter = 0;
export function newLayerId(): string {
	return `ly-${Date.now().toString(36)}-${(counter++).toString(36)}`;
}

export function makeLayer(style: ArtStyleId, scene: SceneState, patch: Partial<Layer> = {}): Layer {
	return { id: newLayerId(), style, scene, blend: 'normal', opacity: 1, visible: true, ...patch };
}

/** A one-layer stack wrapping a single scene (the default, no compositing). */
export function singleStack(style: ArtStyleId, scene: SceneState): LayerStack {
	const layer = makeLayer(style, scene);
	return { layers: [layer], activeId: layer.id };
}

export function activeLayer(stack: LayerStack): Layer {
	return stack.layers.find((l) => l.id === stack.activeId) ?? stack.layers[0];
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Add `layer` on top and make it active (capped at MAX_LAYERS). */
export function addLayer(stack: LayerStack, layer: Layer): LayerStack {
	if (stack.layers.length >= MAX_LAYERS) return stack;
	return { layers: [...stack.layers, layer], activeId: layer.id };
}

/** Remove a layer (never the last one); reassign active to a neighbour. */
export function removeLayer(stack: LayerStack, id: string): LayerStack {
	if (stack.layers.length <= 1) return stack;
	const idx = stack.layers.findIndex((l) => l.id === id);
	if (idx < 0) return stack;
	const layers = stack.layers.filter((l) => l.id !== id);
	const activeId =
		stack.activeId === id ? layers[Math.min(idx, layers.length - 1)].id : stack.activeId;
	return { layers, activeId };
}

/** Move a layer up (+1, toward the top) or down (−1) in the stack. */
export function moveLayer(stack: LayerStack, id: string, dir: 1 | -1): LayerStack {
	const idx = stack.layers.findIndex((l) => l.id === id);
	const to = idx + dir;
	if (idx < 0 || to < 0 || to >= stack.layers.length) return stack;
	const layers = [...stack.layers];
	[layers[idx], layers[to]] = [layers[to], layers[idx]];
	return { layers, activeId: stack.activeId };
}

/** Patch one layer's fields (opacity is clamped to [0,1]). */
export function updateLayer(stack: LayerStack, id: string, patch: Partial<Layer>): LayerStack {
	return {
		...stack,
		layers: stack.layers.map((l) =>
			l.id === id
				? {
						...l,
						...patch,
						opacity: patch.opacity === undefined ? l.opacity : clamp01(patch.opacity)
					}
				: l
		)
	};
}

export function setActive(stack: LayerStack, id: string): LayerStack {
	return stack.layers.some((l) => l.id === id) ? { ...stack, activeId: id } : stack;
}
