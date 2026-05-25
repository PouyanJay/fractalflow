/**
 * Shared, reactive scene state for the active renderer: the canvas reads it
 * each frame, the Inspector edits its parameters, and the status bar reports
 * its camera. Provided via context by the root layout.
 */
import { getContext, setContext } from 'svelte';
import type { Camera2D, FormulaId, SceneState } from '$lib/engine/types';
import { createDefaultScene } from '$lib/fractals/deep-zoom-2d/renderer';

const KEY = Symbol('ff-scene-store');

export function createSceneStore() {
	let scene = $state<SceneState>(createDefaultScene());

	return {
		get scene() {
			return scene;
		},
		get formula() {
			return scene.formula;
		},
		get camera() {
			return scene.camera;
		},
		get maxIter() {
			return scene.maxIter;
		},
		get paletteIndex() {
			return scene.paletteIndex;
		},
		get juliaSeed() {
			return scene.juliaSeed;
		},
		setFormula: (formula: FormulaId) => (scene.formula = formula),
		setCamera: (camera: Camera2D) => (scene.camera = camera),
		setMaxIter: (n: number) => (scene.maxIter = n),
		setPaletteIndex: (i: number) => (scene.paletteIndex = i),
		setJuliaSeed: (x: number, y: number) => (scene.juliaSeed = { x, y }),
		reset: () => (scene = createDefaultScene())
	};
}

export type SceneStore = ReturnType<typeof createSceneStore>;

export function provideSceneStore(): SceneStore {
	const store = createSceneStore();
	setContext(KEY, store);
	return store;
}

export function getSceneStore(): SceneStore {
	const store = getContext<SceneStore>(KEY);
	if (!store) throw new Error('Scene store not found in context — call provideSceneStore().');
	return store;
}
